import { verifyWebhookRequest, WebhookError } from 'npm:@lovable.dev/webhooks-js@0.0.2';
import { z } from 'npm:zod@3.23.8';
import { createServiceClient } from '../_shared/auth.ts';
import { jsonResponse } from '../_shared/responses.ts';

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

type Message = z.infer<typeof MessageSchema>;
type Status = z.infer<typeof StatusSchema>;

const digits = (value: string) => value.replace(/\D/g, '');
const isoFromSeconds = (value?: string) => {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
};
const contentFor = (message: Message) => message.text?.body ?? `[${message.type || 'unsupported'} message]`;
const statusError = (status: Status) => status.errors?.map((error) => [error.code, error.title || error.message].filter(Boolean).join(': ')).join('; ').slice(0, 2000) || null;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  const deliveryId = req.headers.get('x-lovable-delivery')?.trim() || crypto.randomUUID();
  const client = createServiceClient();
  let callbackId: string | null = null;

  try {
    const secret = Deno.env.get('LOVABLE_API_KEY');
    if (!secret) throw new Error('Callback verification is not configured');
    const { payload } = await verifyWebhookRequest({ req, secret, maxBodyBytes: 1024 * 1024 });
    const parsed = PayloadSchema.safeParse(payload);
    if (!parsed.success) throw new Error('Unsupported WhatsApp callback payload');

    const changes = (parsed.data.entry || []).flatMap((entry) => entry.changes || []);
    const messages = changes.flatMap((change) => change.value.messages || []);
    const statuses = changes.flatMap((change) => change.value.statuses || []);
    const eventType = messages.length ? 'message' : statuses.length ? 'status' : 'ignored';
    const firstMessage = messages[0];
    const firstStatus = statuses[0];
    const phoneNumber = digits(firstMessage?.from || firstStatus?.recipient_id || '');
    const providerMessageId = firstMessage?.id || firstStatus?.id || null;

    const { data: callback, error: callbackError } = await client.from('whatsapp_webhook_callbacks').upsert({
      delivery_id: deliveryId,
      provider_message_id: providerMessageId,
      phone_number: phoneNumber || null,
      event_type: eventType,
      status: 'received',
      error_message: null,
    }, { onConflict: 'delivery_id' }).select('id,status').single();
    if (callbackError) throw callbackError;
    callbackId = callback.id;
    if (callback.status === 'processed') return jsonResponse({ ok: true, duplicate: true });

    for (const message of messages) {
      const normalized = digits(message.from);
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
    }

    for (const status of statuses) {
      const { error: updateError } = await client.from('whatsapp_messages').update({
        status: status.status,
      }).eq('provider_message_id', status.id);
      if (updateError) throw updateError;
    }

    const errors = statuses.map(statusError).filter((value): value is string => Boolean(value));
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
    } else {
      await client.from('whatsapp_webhook_callbacks').upsert({ delivery_id: deliveryId, event_type: 'unknown', status: 'error', error_message: safeMessage, processed_at: new Date().toISOString() }, { onConflict: 'delivery_id' });
    }
    console.error(`WhatsApp callback ${deliveryId}: ${safeMessage}`);
    return jsonResponse({ error: safeMessage }, error instanceof WebhookError ? 401 : 400);
  }
});
