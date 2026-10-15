import { verifyWebhookRequest, WebhookError } from 'npm:@lovable.dev/webhooks-js@0.0.2';
import { z } from 'npm:zod@3.23.8';
import { createServiceClient } from '../_shared/auth.ts';
import { jsonResponse } from '../_shared/responses.ts';
import { progressFromReply, type ProgressionOutcome } from '../_shared/course-progression.ts';
import { normalizePhone, statusesBelow } from '../_shared/whatsapp-logic.ts';

const TextSchema = z.object({ body: z.string().max(65536) }).passthrough();
const MessageSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(7).max(32),
  timestamp: z.string().optional(),
  type: z.string().optional(),
  text: TextSchema.optional(),
}).passthrough();
const StatusSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1).max(64),
  timestamp: z.string().optional(),
  recipient_id: z.string().optional(),
  errors: z.array(z.object({ code: z.union([z.string(), z.number()]).optional(), title: z.string().optional(), message: z.string().optional() }).passthrough()).optional(),
}).passthrough();
const ChangeSchema = z.object({
  field: z.string().optional(),
  value: z.object({ messages: z.array(MessageSchema).optional(), statuses: z.array(StatusSchema).optional() }).passthrough(),
}).passthrough();
const PayloadSchema = z.object({ entry: z.array(z.object({ changes: z.array(ChangeSchema).optional() }).passthrough()).optional() }).passthrough();

class PayloadError extends Error {}

type Message = z.infer<typeof MessageSchema>;
type Status = z.infer<typeof StatusSchema>;

const isoFromSeconds = (value?: string) => {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
};
const contentFor = (message: Message) => message.text?.body ?? `[${message.type || 'unsupported'} message]`;
const statusError = (status: Status) => status.errors?.map((error) => [error.code, error.title || error.message].filter(Boolean).join(': ')).join('; ').slice(0, 2000) || null;
const timestampFields = (status: string, occurredAt: string) => ({
  ...(status === 'delivered' ? { delivered_at: occurredAt } : {}),
  ...(status === 'read' ? { read_at: occurredAt } : {}),
  ...(status === 'failed' ? { failed_at: occurredAt } : {}),
});
// Outcomes staff should see on the callback row even though the callback itself succeeded.
const PROGRESSION_NOTES: Partial<Record<ProgressionOutcome, string>> = {
  ambiguous_enrollment: 'Learner has more than one active course awaiting a reply; progression skipped.',
  no_lessons: 'Enrolled course has no lessons; progression skipped.',
};

// Without a delivery header, derive a stable ID from the payload so retries still deduplicate.
const payloadDeliveryId = async (payload: unknown) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
  return `payload-${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  let deliveryId = req.headers.get('x-lovable-delivery')?.trim() || null;
  const client = createServiceClient();
  let callbackId: string | null = null;
  let verified = false;

  try {
    const secret = Deno.env.get('LOVABLE_API_KEY');
    if (!secret) throw new Error('Callback verification is not configured');
    const { payload } = await verifyWebhookRequest({ req, secret, maxBodyBytes: 1024 * 1024 });
    verified = true;
    deliveryId ||= await payloadDeliveryId(payload);
    const parsed = PayloadSchema.safeParse(payload);
    if (!parsed.success) throw new PayloadError('Unsupported WhatsApp callback payload');

    const changes = (parsed.data.entry || []).flatMap((entry) => entry.changes || []);
    const messages = changes.flatMap((change) => change.value.messages || []);
    const statuses = changes.flatMap((change) => change.value.statuses || []);
    const eventType = messages.length ? 'message' : statuses.length ? 'status' : 'ignored';
    const firstMessage = messages[0];
    const firstStatus = statuses[0];
    const phoneNumber = normalizePhone(firstMessage?.from || firstStatus?.recipient_id || '');
    const providerMessageId = firstMessage?.id || firstStatus?.id || null;

    const { error: insertError } = await client.from('whatsapp_webhook_callbacks').upsert({
      delivery_id: deliveryId,
      provider_message_id: providerMessageId,
      phone_number: phoneNumber,
      event_type: eventType,
      status: 'received',
    }, { onConflict: 'delivery_id', ignoreDuplicates: true });
    if (insertError) throw insertError;
    const { data: callback, error: callbackError } = await client.from('whatsapp_webhook_callbacks')
      .select('id,status').eq('delivery_id', deliveryId).single();
    if (callbackError) throw callbackError;
    callbackId = callback.id;
    if (callback.status === 'processed' || callback.status === 'ignored') return jsonResponse({ ok: true, duplicate: true });
    const notes: string[] = [];

    for (const message of messages) {
      const normalized = normalizePhone(message.from);
      if (!normalized) throw new PayloadError(`Invalid sender phone number on message ${message.id}`);
      const sentAt = isoFromSeconds(message.timestamp);
      const { error: contactError } = await client.from('whatsapp_contacts').upsert({
        phone_number: normalized,
        updated_at: sentAt,
      }, { onConflict: 'phone_number' });
      if (contactError) throw contactError;
      const { error: messageError } = await client.from('whatsapp_messages').upsert({
        phone_number: normalized,
        direction: 'incoming',
        content: contentFor(message),
        provider_message_id: message.id,
        status: 'received',
        sent_at: sentAt,
      }, { onConflict: 'provider_message_id' });
      if (messageError) throw messageError;
      // Failures propagate so the callback is marked as an error and the provider retries it;
      // progression is idempotent per provider message ID.
      if (message.text?.body) {
        const outcome = await progressFromReply(normalized, message.text.body, message.id);
        const note = PROGRESSION_NOTES[outcome];
        if (note) notes.push(`${message.id}: ${note}`);
      }
    }

    for (const status of statuses) {
      const occurredAt = isoFromSeconds(status.timestamp);
      const errorMessage = statusError(status);
      const lower = statusesBelow(status.status);
      const { error: timestampError } = await client.from('whatsapp_messages').update({
        ...timestampFields(status.status, occurredAt),
        ...(errorMessage ? { status_error: errorMessage } : {}),
      }).eq('provider_message_id', status.id);
      if (timestampError) throw timestampError;
      if (lower) {
        const { error: updateError } = await client.from('whatsapp_messages').update({ status: status.status })
          .eq('provider_message_id', status.id).in('status', lower);
        if (updateError) throw updateError;
      }
      const { data: job, error: jobLookupError } = await client.from('whatsapp_template_send_jobs')
        .select('id,template_version_id').eq('provider_message_id', status.id).maybeSingle();
      if (jobLookupError) throw jobLookupError;
      if (job) {
        const { error: jobTimestampError } = await client.from('whatsapp_template_send_jobs').update({
          ...timestampFields(status.status, occurredAt),
          ...(errorMessage ? { error_message: errorMessage } : {}),
        }).eq('id', job.id);
        if (jobTimestampError) throw jobTimestampError;
        if (lower) {
          const { error: jobUpdateError } = await client.from('whatsapp_template_send_jobs').update({ status: status.status })
            .eq('id', job.id).in('status', [...lower, 'queued', 'processing']);
          if (jobUpdateError) throw jobUpdateError;
        }
        const { error: auditError } = await client.from('whatsapp_template_events').insert({
          template_version_id: job.template_version_id, send_job_id: job.id, event_type: 'delivery_status',
          status: status.status, details: { provider_message_id: status.id, occurred_at: occurredAt, error: errorMessage },
        });
        if (auditError) throw auditError;
      }
    }

    const errors = [...statuses.map(statusError).filter((value): value is string => Boolean(value)), ...notes];
    const { error: completeError } = await client.from('whatsapp_webhook_callbacks').update({
      status: eventType === 'ignored' ? 'ignored' : 'processed',
      processed_at: new Date().toISOString(),
      error_message: errors.length ? errors.join('; ').slice(0, 2000) : null,
    }).eq('id', callback.id);
    if (completeError) throw completeError;

    return jsonResponse({ ok: true, messages: messages.length, statuses: statuses.length });
  } catch (error) {
    const safeMessage = error instanceof WebhookError ? `Verification failed: ${error.code}` : error instanceof Error ? error.message.slice(0, 2000) : 'Callback processing failed';
    if (callbackId) {
      await client.from('whatsapp_webhook_callbacks').update({ status: 'error', error_message: safeMessage, processed_at: new Date().toISOString() }).eq('id', callbackId);
    } else if (verified && deliveryId) {
      await client.from('whatsapp_webhook_callbacks').upsert({ delivery_id: deliveryId, event_type: 'unknown', status: 'error', error_message: safeMessage, processed_at: new Date().toISOString() }, { onConflict: 'delivery_id' });
    }
    console.error(`WhatsApp callback ${deliveryId}: ${safeMessage}`);
    // 401 for bad signatures, 400 for payloads we will never accept, 500 so transient failures are retried.
    const status = error instanceof WebhookError ? 401 : error instanceof PayloadError ? 400 : 500;
    return jsonResponse({ error: safeMessage }, status);
  }
});
