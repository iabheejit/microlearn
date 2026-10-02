import { createServiceClient } from './auth.ts';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/whatsapp';

export async function sendWhatsAppText(phoneNumber: string, content: string) {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  const connectionKey = Deno.env.get('WHATSAPP_API_KEY');
  if (!lovableKey || !connectionKey) throw new Error('WhatsApp Business connection is not configured');
  const response = await fetch(`${GATEWAY_URL}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': connectionKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: phoneNumber, type: 'text', text: { body: content } }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`WhatsApp send failed [${response.status}]: ${body.slice(0, 1500)}`);
  const result = JSON.parse(body);
  if (result.error) throw new Error(`WhatsApp send failed: ${JSON.stringify(result.error).slice(0, 1500)}`);
  const messageId = result.messages?.[0]?.id;
  if (typeof messageId !== 'string') throw new Error('WhatsApp did not return a message ID');
  const client = createServiceClient();
  const { error } = await client.from('whatsapp_messages').upsert({
    phone_number: phoneNumber, direction: 'outgoing', content,
    provider_message_id: messageId, status: 'accepted',
  }, { onConflict: 'provider_message_id', ignoreDuplicates: true });
  if (error) throw error;
  return messageId;
}