import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// Bare WhatsApp callback persistence: inbox record, inbound messages, delivery statuses.
// Course progression and AI replies are intentionally NOT handled here yet.

const MessageSchema = z
  .object({
    id: z.string().min(1),
    from: z.string().min(7).max(32),
    timestamp: z.string().optional(),
    type: z.string().optional(),
    text: z.object({ body: z.string().max(65536) }).passthrough().optional(),
  })
  .passthrough();

const StatusSchema = z
  .object({
    id: z.string().min(1),
    status: z.string().min(1).max(64),
    timestamp: z.string().optional(),
    recipient_id: z.string().optional(),
    errors: z
      .array(
        z
          .object({
            code: z.union([z.string(), z.number()]).optional(),
            title: z.string().optional(),
            message: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const PayloadSchema = z
  .object({
    entry: z
      .array(
        z
          .object({
            changes: z
              .array(
                z
                  .object({
                    field: z.string().optional(),
                    value: z
                      .object({
                        messages: z.array(MessageSchema).optional(),
                        statuses: z.array(StatusSchema).optional(),
                      })
                      .passthrough(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

type Message = z.infer<typeof MessageSchema>;
type Status = z.infer<typeof StatusSchema>;

const digits = (value: string) => value.replace(/\D/g, "");
const isoFromSeconds = (value?: string) => {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : new Date().toISOString();
};
const contentFor = (message: Message) => message.text?.body ?? `[${message.type || "unsupported"} message]`;
const statusError = (status: Status) =>
  status.errors
    ?.map((error) => [error.code, error.title || error.message].filter(Boolean).join(": "))
    .join("; ")
    .slice(0, 2000) || null;

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Backend service credentials are not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type CallbackResult = { status: "processed" | "ignored" | "duplicate" };

export async function persistWhatsAppCallback(deliveryId: string, payload: unknown): Promise<CallbackResult> {
  const parsed = PayloadSchema.safeParse(payload);
  if (!parsed.success) throw new Error("Unsupported WhatsApp callback payload");

  const changes = (parsed.data.entry ?? []).flatMap((entry) => entry.changes ?? []);
  const messages = changes.flatMap((change) => change.value.messages ?? []);
  const statuses = changes.flatMap((change) => change.value.statuses ?? []);
  const eventType = messages.length ? "message" : statuses.length ? "status" : "ignored";
  const phoneNumber = digits(messages[0]?.from || statuses[0]?.recipient_id || "");
  const providerMessageId = messages[0]?.id || statuses[0]?.id || null;

  const client = serviceClient();
  const { data: callback, error: callbackError } = await client
    .from("whatsapp_webhook_callbacks")
    .upsert(
      {
        delivery_id: deliveryId,
        provider_message_id: providerMessageId,
        phone_number: phoneNumber || null,
        event_type: eventType,
        status: "received",
        error_message: null,
      },
      { onConflict: "delivery_id" },
    )
    .select("id,status")
    .single();
  if (callbackError) throw callbackError;
  if (callback.status === "processed") return { status: "duplicate" };

  try {
    for (const message of messages) {
      const normalized = digits(message.from);
      const sentAt = isoFromSeconds(message.timestamp);
      const { error: contactError } = await client
        .from("whatsapp_contacts")
        .upsert({ phone_number: normalized, updated_at: sentAt }, { onConflict: "phone_number" });
      if (contactError) throw contactError;
      const { error: messageError } = await client.from("whatsapp_messages").upsert(
        {
          phone_number: normalized,
          direction: "incoming",
          content: contentFor(message),
          provider_message_id: message.id,
          status: "received",
          sent_at: sentAt,
        },
        { onConflict: "provider_message_id" },
      );
      if (messageError) throw messageError;
    }

    for (const status of statuses) {
      const occurredAt = isoFromSeconds(status.timestamp);
      const { error: updateError } = await client
        .from("whatsapp_messages")
        .update({
          status: status.status,
          status_error: statusError(status),
          ...(status.status === "delivered" ? { delivered_at: occurredAt } : {}),
          ...(status.status === "read" ? { read_at: occurredAt } : {}),
          ...(status.status === "failed" ? { failed_at: occurredAt } : {}),
        })
        .eq("provider_message_id", status.id);
      if (updateError) throw updateError;
    }

    const errors = statuses.map(statusError).filter((value): value is string => Boolean(value));
    const finalStatus = eventType === "ignored" ? "ignored" : "processed";
    const { error: completeError } = await client
      .from("whatsapp_webhook_callbacks")
      .update({
        status: finalStatus,
        processed_at: new Date().toISOString(),
        error_message: errors.length ? errors.join("; ").slice(0, 2000) : null,
      })
      .eq("id", callback.id);
    if (completeError) throw completeError;
    return { status: finalStatus };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Callback processing failed";
    await client
      .from("whatsapp_webhook_callbacks")
      .update({ status: "failed", error_message: message.slice(0, 2000) })
      .eq("id", callback.id);
    throw error;
  }
}
