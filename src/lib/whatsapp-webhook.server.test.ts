import { describe, expect, it } from "vitest";
import {
  PayloadError,
  persistWhatsAppCallback,
} from "./whatsapp-webhook.server";
import { fakeSupabase } from "@/test/fake-supabase";
import type { InboundTextHandler } from "./whatsapp-webhook.server";

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
    const { client, rows } = fakeSupabase();
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
    const { client, rows } = fakeSupabase();
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
    const { client } = fakeSupabase();
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

describe("persistWhatsAppCallback progression hook", () => {
  it("runs once per stored text message and notes skipped progression", async () => {
    const { client, rows } = fakeSupabase();
    const seen: Array<Parameters<InboundTextHandler>[1]> = [];
    const hook: InboundTextHandler = async (_client, message) => {
      seen.push(message);
      return "skipped for test";
    };
    await persistWhatsAppCallback(
      "d-hook",
      messagePayload("wamid.h", "start"),
      client,
      hook,
    );
    await persistWhatsAppCallback(
      "d-hook",
      messagePayload("wamid.h", "start"),
      client,
      hook,
    );
    expect(seen).toEqual([
      {
        id: "wamid.h",
        phone: "919766072308",
        text: "start",
        replyId: null,
        replyTitle: null,
      },
    ]);
    expect(rows("whatsapp_webhook_callbacks")[0]).toMatchObject({
      status: "processed",
      error_message: "wamid.h: skipped for test",
    });
  });

  it("passes button taps, list picks and template quick-replies to the hook", async () => {
    const { client, rows } = fakeSupabase();
    const seen: Array<Parameters<InboundTextHandler>[1]> = [];
    const hook: InboundTextHandler = async (_client, message) => {
      seen.push(message);
    };
    const tap = (id: string, message: Record<string, unknown>) => ({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id,
                    from: "919766072308",
                    timestamp: "1760000000",
                    ...message,
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    await persistWhatsAppCallback(
      "d-b",
      tap("w.b", {
        type: "interactive",
        interactive: {
          type: "button_reply",
          button_reply: { id: "course:next", title: "Next" },
        },
      }),
      client,
      hook,
    );
    await persistWhatsAppCallback(
      "d-l",
      tap("w.l", {
        type: "interactive",
        interactive: {
          type: "list_reply",
          list_reply: { id: "quiz:2", title: "Option 2" },
        },
      }),
      client,
      hook,
    );
    await persistWhatsAppCallback(
      "d-t",
      tap("w.t", {
        type: "button",
        button: { payload: "Start", text: "Start" },
      }),
      client,
      hook,
    );
    expect(
      seen.map(({ replyId, replyTitle, text }) => ({
        replyId,
        replyTitle,
        text,
      })),
    ).toEqual([
      { replyId: "course:next", replyTitle: "Next", text: null },
      { replyId: "quiz:2", replyTitle: "Option 2", text: null },
      { replyId: "Start", replyTitle: "Start", text: null },
    ]);
    expect(rows("whatsapp_messages").map((row) => row.content)).toEqual([
      "[Next]",
      "[Option 2]",
      "[Start]",
    ]);
  });

  it("marks the callback as an error when progression fails, so a retry runs it again", async () => {
    const { client, rows } = fakeSupabase();
    let calls = 0;
    const flaky = async () => {
      calls += 1;
      if (calls === 1) throw new Error("gateway timeout");
    };
    await expect(
      persistWhatsAppCallback(
        "d-retry",
        messagePayload("wamid.r"),
        client,
        flaky,
      ),
    ).rejects.toThrow("gateway timeout");
    expect(rows("whatsapp_webhook_callbacks")[0]).toMatchObject({
      status: "error",
    });
    expect(
      await persistWhatsAppCallback(
        "d-retry",
        messagePayload("wamid.r"),
        client,
        flaky,
      ),
    ).toEqual({ status: "processed" });
    expect(calls).toBe(2);
    expect(rows("whatsapp_messages")).toHaveLength(1);
  });
});
