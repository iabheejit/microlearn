import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  normalizePhone,
  statusesBelow,
} from "../../supabase/functions/_shared/whatsapp-logic.ts";

// WhatsApp callback persistence: inbox record, inbound messages, delivery statuses.
// Course progression runs through the optional onInboundText hook, after messages are stored.

const MessageSchema = z
  .object({
    id: z.string().min(1),
    from: z.string().min(7).max(32),
    timestamp: z.string().optional(),
    type: z.string().optional(),
    text: z
      .object({ body: z.string().max(65536) })
      .passthrough()
      .optional(),
    // Taps on reply buttons and list rows sent by the course.
    interactive: z
      .object({
        type: z.string().optional(),
        button_reply: z
          .object({ id: z.string().max(256), title: z.string().max(256) })
          .passthrough()
          .optional(),
        list_reply: z
          .object({ id: z.string().max(256), title: z.string().max(256) })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    // Taps on a template's quick-reply button.
    button: z
      .object({
        payload: z.string().max(256).optional(),
        text: z.string().max(256).optional(),
      })
      .passthrough()
      .optional(),
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

/** A callback we will never accept; the route answers 400 so the provider stops retrying it. */
export class PayloadError extends Error {}

const isoFromSeconds = (value?: string) => {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : new Date().toISOString();
};
/** What the learner sent: typed text, or the id and label of the button or list row they tapped. */
export function replyOf(message: Message) {
  const tapped =
    message.interactive?.button_reply ?? message.interactive?.list_reply;
  if (tapped)
    return { text: null, replyId: tapped.id, replyTitle: tapped.title };
  if (message.button) {
    return {
      text: null,
      replyId: message.button.payload || message.button.text || null,
      replyTitle: message.button.text ?? null,
    };
  }
  return { text: message.text?.body ?? null, replyId: null, replyTitle: null };
}
const contentFor = (message: Message) => {
  const reply = replyOf(message);
  return (
    reply.text ??
    (reply.replyTitle
      ? `[${reply.replyTitle}]`
      : `[${message.type || "unsupported"} message]`)
  );
};
const statusError = (status: Status) =>
  status.errors
    ?.map((error) =>
      [error.code, error.title || error.message].filter(Boolean).join(": "),
    )
    .join("; ")
    .slice(0, 2000) || null;
const timestampFields = (status: string, occurredAt: string) => ({
  ...(status === "delivered" ? { delivered_at: occurredAt } : {}),
  ...(status === "read" ? { read_at: occurredAt } : {}),
  ...(status === "failed" ? { failed_at: occurredAt } : {}),
});

export function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("Backend service credentials are not configured");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type CallbackResult = { status: "processed" | "ignored" | "duplicate" };

/**
 * Runs for each stored inbound message (text, tapped reply, or media/unsupported with no text);
 * a returned string is noted on the callback row.
 */
export type InboundTextHandler = (
  client: SupabaseClient,
  message: {
    id: string;
    phone: string;
    text: string | null;
    replyId: string | null;
    replyTitle: string | null;
  },
) => Promise<string | null | void>;

async function applyStatus(client: SupabaseClient, status: Status) {
  const occurredAt = isoFromSeconds(status.timestamp);
  const errorMessage = statusError(status);
  // Meta can deliver statuses out of order; timestamps always land, the status only moves forward.
  const lower = statusesBelow(status.status);
  const { error: timestampError } = await client
    .from("whatsapp_messages")
    .update({
      ...timestampFields(status.status, occurredAt),
      ...(errorMessage ? { status_error: errorMessage } : {}),
    })
    .eq("provider_message_id", status.id);
  if (timestampError) throw timestampError;
  if (lower) {
    const { error } = await client
      .from("whatsapp_messages")
      .update({ status: status.status })
      .eq("provider_message_id", status.id)
      .in("status", lower);
    if (error) throw error;
  }

  const { data: job, error: jobLookupError } = await client
    .from("whatsapp_template_send_jobs")
    .select("id,template_version_id")
    .eq("provider_message_id", status.id)
    .maybeSingle();
  if (jobLookupError) throw jobLookupError;
  if (!job) return;
  const { error: jobTimestampError } = await client
    .from("whatsapp_template_send_jobs")
    .update({
      ...timestampFields(status.status, occurredAt),
      ...(errorMessage ? { error_message: errorMessage } : {}),
    })
    .eq("id", job.id);
  if (jobTimestampError) throw jobTimestampError;
  if (lower) {
    const { error } = await client
      .from("whatsapp_template_send_jobs")
      .update({ status: status.status })
      .eq("id", job.id)
      .in("status", [...lower, "queued", "processing"]);
    if (error) throw error;
  }
  const { error: auditError } = await client
    .from("whatsapp_template_events")
    .insert({
      template_version_id: job.template_version_id,
      send_job_id: job.id,
      event_type: "delivery_status",
      status: status.status,
      details: {
        provider_message_id: status.id,
        occurred_at: occurredAt,
        error: errorMessage,
      },
    });
  if (auditError) throw auditError;
}

export async function persistWhatsAppCallback(
  deliveryId: string,
  payload: unknown,
  client: SupabaseClient = serviceClient(),
  onInboundText?: InboundTextHandler,
): Promise<CallbackResult> {
  const parsed = PayloadSchema.safeParse(payload);
  if (!parsed.success)
    throw new PayloadError("Unsupported WhatsApp callback payload");

  const changes = (parsed.data.entry ?? []).flatMap(
    (entry) => entry.changes ?? [],
  );
  const messages = changes.flatMap((change) => change.value.messages ?? []);
  const statuses = changes.flatMap((change) => change.value.statuses ?? []);
  const eventType = messages.length
    ? "message"
    : statuses.length
      ? "status"
      : "ignored";
  const phoneNumber = normalizePhone(
    messages[0]?.from || statuses[0]?.recipient_id || "",
  );
  const providerMessageId = messages[0]?.id || statuses[0]?.id || null;

  // Insert-if-absent, then read back: an upsert that rewrites status would hide earlier processing.
  const { error: insertError } = await client
    .from("whatsapp_webhook_callbacks")
    .upsert(
      {
        delivery_id: deliveryId,
        provider_message_id: providerMessageId,
        phone_number: phoneNumber,
        event_type: eventType,
        status: "received",
      },
      { onConflict: "delivery_id", ignoreDuplicates: true },
    );
  if (insertError) throw insertError;
  const { data: callback, error: callbackError } = await client
    .from("whatsapp_webhook_callbacks")
    .select("id,status")
    .eq("delivery_id", deliveryId)
    .single();
  if (callbackError) throw callbackError;
  if (callback.status === "processed" || callback.status === "ignored")
    return { status: "duplicate" };

  const notes: string[] = [];
  try {
    for (const message of messages) {
      const normalized = normalizePhone(message.from);
      if (!normalized)
        throw new PayloadError(
          `Invalid sender phone number on message ${message.id}`,
        );
      const sentAt = isoFromSeconds(message.timestamp);
      const { error: contactError } = await client
        .from("whatsapp_contacts")
        .upsert(
          { phone_number: normalized, updated_at: sentAt },
          { onConflict: "phone_number" },
        );
      if (contactError) throw contactError;
      const { error: messageError } = await client
        .from("whatsapp_messages")
        .upsert(
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
      // Failures propagate: the callback is marked 'error' and the provider retries it.
      // The handler must be idempotent per provider message ID (progression is).
      // Reactions are acknowledgements, not requests; every other message gets a reply.
      const reply = replyOf(message);
      if (onInboundText && message.type !== "reaction") {
        const note = await onInboundText(client, {
          id: message.id,
          phone: normalized,
          ...reply,
        });
        if (note) notes.push(`${message.id}: ${note}`);
      }
    }

    for (const status of statuses) await applyStatus(client, status);

    const errors = [
      ...statuses
        .map(statusError)
        .filter((value): value is string => Boolean(value)),
      ...notes,
    ];
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
    const message =
      error instanceof Error ? error.message : "Callback processing failed";
    // 'error' is the status the diagnostics page reports as the last failed callback.
    await client
      .from("whatsapp_webhook_callbacks")
      .update({
        status: "error",
        error_message: message.slice(0, 2000),
        processed_at: new Date().toISOString(),
      })
      .eq("id", callback.id);
    throw error;
  }
}
