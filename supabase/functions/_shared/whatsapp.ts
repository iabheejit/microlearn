import { createServiceClient } from './auth.ts';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/whatsapp';

export class WhatsAppGatewayError extends Error {
  constructor(public status: number, public details: string) {
    super(`WhatsApp request failed [${status}]: ${details.slice(0, 1500)}`);
  }
}

// Every WhatsApp provider call (webhook automation, staff actions, monitors) goes through here.
export async function callWhatsAppGateway(path: string, method = 'GET', body?: unknown) {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  const connectionKey = Deno.env.get('WHATSAPP_API_KEY');
  if (!lovableKey || !connectionKey) throw new Error('WhatsApp Business connection is not configured');
  const response = await fetch(`${GATEWAY_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': connectionKey,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new WhatsAppGatewayError(response.status, text);
  let data: Record<string, unknown>;
  try { data = JSON.parse(text); } catch { data = {}; }
  if (data.error) throw new WhatsAppGatewayError(502, JSON.stringify(data.error));
  return data;
}

type OutgoingRecord = { content: string; templateName?: string };

// Sends a message and records it only once WhatsApp returns a genuine provider message ID.
async function sendAndRecord(phoneNumber: string, payload: Record<string, unknown>, record: OutgoingRecord) {
  const result = await callWhatsAppGateway('/messages', 'POST', { messaging_product: 'whatsapp', to: phoneNumber, ...payload });
  const messageId = (result.messages as Array<{ id?: unknown }> | undefined)?.[0]?.id;
  if (typeof messageId !== 'string') throw new WhatsAppGatewayError(502, 'WhatsApp did not return a message ID');
  const client = createServiceClient();
  const { error: contactError } = await client.from('whatsapp_contacts').upsert({ phone_number: phoneNumber }, { onConflict: 'phone_number' });
  if (contactError) throw contactError;
  const { error } = await client.from('whatsapp_messages').upsert({
    phone_number: phoneNumber, direction: 'outgoing', content: record.content,
    template_name: record.templateName ?? null, provider_message_id: messageId, status: 'accepted',
  }, { onConflict: 'provider_message_id', ignoreDuplicates: true });
  if (error) throw error;
  return { messageId, response: result };
}

export function sendWhatsAppText(phoneNumber: string, content: string) {
  return sendAndRecord(phoneNumber, { type: 'text', text: { body: content } }, { content }).then((result) => result.messageId);
}

export function sendWhatsAppTemplate(phoneNumber: string, templateName: string, parameters: string[], language = 'en_US') {
  const components = parameters.length ? [{ type: 'body', parameters: parameters.map((text) => ({ type: 'text', text })) }] : [];
  return sendAndRecord(phoneNumber, { type: 'template', template: { name: templateName, language: { code: language }, components } }, {
    content: parameters.length ? `${templateName}: ${parameters.join(', ')}` : templateName,
    templateName,
  });
}
