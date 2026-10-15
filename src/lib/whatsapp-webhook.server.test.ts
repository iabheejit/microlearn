import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  deliveryIdFor,
  PayloadError,
  persistWhatsAppCallback,
} from "./whatsapp-webhook.server";

type Row = Record<string, unknown>;

// Minimal in-memory stand-in for the query-builder calls the callback handler makes.
function fakeClient() {
  const tables: Record<string, Row[]> = {};
  const rows = (table: string) => (tables[table] ||= []);
  let nextId = 1;

  const from = (table: string) => {
    let op: "select" | "insert" | "upsert" | "update" = "select";
    let values: Row = {};
    let options: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    const filters: Array<(row: Row) => boolean> = [];
    let mode: "many" | "single" | "maybeSingle" = "many";

    const run = () => {
      const matching = () =>
        rows(table).filter((row) => filters.every((filter) => filter(row)));
      if (op === "insert") {
        rows(table).push({ id: String(nextId++), ...values });
        return { data: null, error: null };
      }
      if (op === "upsert") {
        const keys = (options.onConflict || "id").split(",");
        const existing = rows(table).find((row) =>
          keys.every((key) => row[key] === values[key]),
        );
        if (existing) {
          if (!options.ignoreDuplicates) Object.assign(existing, values);
        } else {
          rows(table).push({ id: String(nextId++), ...values });
        }
        return { data: null, error: null };
      }
      if (op === "update") {
        matching().forEach((row) => Object.assign(row, values));
        return { data: null, error: null };
      }
      const found = matching();
      if (mode === "many") return { data: found, error: null };
      if (mode === "single" && found.length !== 1)
        return { data: null, error: { message: "expected one row" } };
      return { data: found[0] ?? null, error: null };
    };

    const builder = {
      select: () => builder,
      insert: (row: Row) => ((op = "insert"), (values = row), builder),
      upsert: (row: Row, opts = {}) => (
        (op = "upsert"),
        (values = row),
        (options = opts),
        builder
      ),
      update: (row: Row) => ((op = "update"), (values = row), builder),
      eq: (column: string, value: unknown) => (
        filters.push((row) => row[column] === value),
        builder
      ),
      in: (column: string, list: unknown[]) => (
        filters.push((row) => list.includes(row[column])),
        builder
      ),
      single: () => ((mode = "single"), builder),
      maybeSingle: () => ((mode = "maybeSingle"), builder),
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve().then(run).then(resolve, reject),
    };
    return builder;
  };

  return { client: { from } as unknown as SupabaseClient, rows };
}

const messagePayload = (id: string, body = "hi") => ({
  entry: [
    {
      changes: [
        {
          value: {
            messages: [
              {
                id,
                from: "+91 97660 72308",
                timestamp: "1760000000",
                type: "text",
                text: { body },
              },
            ],
          },
        },
      ],
    },
  ],
});
const statusPayload = (id: string, status: string, timestamp: string) => ({
  entry: [
    {
      changes: [
        {
          value: {
            statuses: [{ id, status, timestamp, recipient_id: "919766072308" }],
          },
        },
      ],
    },
  ],
});

describe("persistWhatsAppCallback", () => {
  it("stores one message and reports a duplicate when the same callback arrives twice", async () => {
    const { client, rows } = fakeClient();
    expect(
      await persistWhatsAppCallback(
        "delivery-1",
        messagePayload("wamid.1"),
        client,
      ),
    ).toEqual({ status: "processed" });
    expect(
      await persistWhatsAppCallback(
        "delivery-1",
        messagePayload("wamid.1"),
        client,
      ),
    ).toEqual({ status: "duplicate" });

    expect(rows("whatsapp_messages")).toHaveLength(1);
    expect(rows("whatsapp_messages")[0]).toMatchObject({
      phone_number: "919766072308",
      provider_message_id: "wamid.1",
      direction: "incoming",
    });
    expect(rows("whatsapp_webhook_callbacks")).toHaveLength(1);
  });

  it("never moves a delivery status backwards", async () => {
    const { client, rows } = fakeClient();
    rows("whatsapp_messages").push({
      id: "m1",
      provider_message_id: "wamid.out",
      status: "accepted",
    });

    await persistWhatsAppCallback(
      "d-read",
      statusPayload("wamid.out", "read", "1760000200"),
      client,
    );
    await persistWhatsAppCallback(
      "d-delivered",
      statusPayload("wamid.out", "delivered", "1760000100"),
      client,
    );

    expect(rows("whatsapp_messages")[0]).toMatchObject({ status: "read" });
    expect(rows("whatsapp_messages")[0].delivered_at).toBeTruthy();
  });

  it("rejects unparseable payloads and invalid senders as PayloadError", async () => {
    const { client } = fakeClient();
    await expect(
      persistWhatsAppCallback("d-bad", { entry: "nope" }, client),
    ).rejects.toBeInstanceOf(PayloadError);
    const badSender = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ id: "w", from: "1234567", text: { body: "x" } }],
              },
            },
          ],
        },
      ],
    };
    await expect(
      persistWhatsAppCallback("d-sender", badSender, client),
    ).rejects.toBeInstanceOf(PayloadError);
  });
});

describe("deliveryIdFor", () => {
  it("prefers the delivery header and otherwise derives a stable ID from the payload", async () => {
    expect(await deliveryIdFor(" abc ", {})).toBe("abc");
    const first = await deliveryIdFor(null, messagePayload("wamid.1"));
    expect(first).toMatch(/^payload-[0-9a-f]{64}$/);
    expect(await deliveryIdFor(undefined, messagePayload("wamid.1"))).toBe(
      first,
    );
  });
});
