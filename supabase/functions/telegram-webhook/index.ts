import { z } from 'npm:zod';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createServiceClient, requireStaff, requireUser } from '../_shared/auth.ts';
import { errorResponse, jsonResponse, optionsResponse } from '../_shared/responses.ts';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';
const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY');
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const deriveWebhookSecret = async (connectionKey: string) => {
  const bytes = new TextEncoder().encode(`telegram-webhook:${connectionKey}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const SendSchema = z.object({ chatId: z.union([z.string(), z.number()]).transform(String), text: z.string().trim().min(1).max(4096) });
const MessageSchema = z.object({
  message_id: z.number(), date: z.number(), text: z.string().optional(),
  from: z.object({ id: z.number(), first_name: z.string().optional(), last_name: z.string().optional(), username: z.string().optional(), is_bot: z.boolean().optional() }),
  chat: z.object({ id: z.number(), first_name: z.string().optional(), last_name: z.string().optional(), username: z.string().optional() }),
});
const UpdateSchema = z.object({ update_id: z.number(), message: MessageSchema.optional(), edited_message: MessageSchema.optional() });

const telegramCall = async (path: string, body: object) => {
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) throw new Error('Telegram connection is not configured');
  const response = await fetch(`${GATEWAY_URL}/${path}`, { method: 'POST', headers: {
    Authorization: `Bearer ${LOVABLE_API_KEY}`, 'X-Connection-Api-Key': TELEGRAM_API_KEY, 'Content-Type': 'application/json',
  }, body: JSON.stringify(body) });
  const responseBody = await response.text();
  if (!response.ok) throw new Response(JSON.stringify({ error: responseBody, status: response.status }), { status: response.status });
  const data = JSON.parse(responseBody);
  if (data.ok === false) throw new Response(JSON.stringify({ error: data.description || data.error || 'Telegram request failed' }), { status: 400 });
  return data;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  try {
    const pathEndpoint = new URL(req.url).pathname.split('/').filter(Boolean).pop();
    const isWebhook = req.method === 'POST' && req.headers.has('X-Telegram-Bot-Api-Secret-Token');
    const requestBody = req.method === 'POST' && !isWebhook ? await req.json() : undefined;
    const endpoint = requestBody && typeof requestBody === 'object' && 'endpoint' in requestBody
      ? String(requestBody.endpoint)
      : pathEndpoint;
    if (endpoint === 'getUpdates' && req.method === 'GET') {
      await requireUser(req);
      const client = createServiceClient();
      const { data, error } = await client.from('telegram_messages').select('*').order('sent_at', { ascending: true }).limit(200);
      if (error) throw error;
      return jsonResponse({ messages: data });
    }
    if (endpoint === 'getAnalytics' && req.method === 'GET') {
      await requireUser(req);
      const client = createServiceClient();
      const [{ count: contacts, error: contactsError }, { data: messages, error: messagesError }] = await Promise.all([
        client.from('telegram_contacts').select('*', { count: 'exact', head: true }),
        client.from('telegram_messages').select('direction,sent_at'),
      ]);
      if (contactsError) throw contactsError;
      if (messagesError) throw messagesError;
      const incoming = messages.filter((message) => message.direction === 'incoming').length;
      const outgoing = messages.length - incoming;
      const messagesByDate = messages.reduce<Record<string, number>>((result, message) => {
        const day = message.sent_at.slice(0, 10);
        result[day] = (result[day] || 0) + 1;
        return result;
      }, {});
      return jsonResponse({ analytics: { totalUpdates: messages.length, uniqueUsers: contacts || 0, incoming, outgoing, messagesByDate } });
    }
    if (endpoint === 'sendMessage' && req.method === 'POST') {
      await requireStaff(req);
      const parsed = SendSchema.safeParse(requestBody);
      if (!parsed.success) return jsonResponse({ error: parsed.error.flatten().fieldErrors }, 400);
      const data = await telegramCall('sendMessage', { chat_id: parsed.data.chatId, text: parsed.data.text });
      const message = data.result;
      const client = createServiceClient();
      await client.from('telegram_contacts').upsert({ chat_id: parsed.data.chatId, last_interaction_at: new Date().toISOString() }, { onConflict: 'chat_id' });
      const { error } = await client.from('telegram_messages').upsert({
        chat_id: parsed.data.chatId, telegram_message_id: String(message.message_id), direction: 'outgoing', content: parsed.data.text,
        sent_at: new Date((message.date || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      }, { onConflict: 'chat_id,telegram_message_id,direction' });
      if (error) throw error;
      return jsonResponse(data);
    }
    if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
    if (!TELEGRAM_API_KEY) throw new Error('Telegram connection is not configured');
    const expectedSecret = await deriveWebhookSecret(TELEGRAM_API_KEY);
    if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== expectedSecret) return jsonResponse({ error: 'Unauthorized' }, 401);
    const parsed = UpdateSchema.safeParse(await req.json());
    if (!parsed.success) return jsonResponse({ error: parsed.error.flatten().fieldErrors }, 400);
    const message = parsed.data.message || parsed.data.edited_message;
    if (!message?.text) return jsonResponse({ ok: true, ignored: true });
    const chatId = String(message.chat.id);
    const client = createServiceClient();
    const { error: contactError } = await client.from('telegram_contacts').upsert({
      chat_id: chatId, telegram_user_id: String(message.from.id), username: message.from.username || message.chat.username || null,
      first_name: message.from.first_name || message.chat.first_name || null, last_name: message.from.last_name || message.chat.last_name || null,
      last_interaction_at: new Date(message.date * 1000).toISOString(),
    }, { onConflict: 'chat_id' });
    if (contactError) throw contactError;
    const { error: messageError } = await client.from('telegram_messages').upsert({
      chat_id: chatId, telegram_message_id: String(message.message_id), update_id: String(parsed.data.update_id),
      direction: 'incoming', content: message.text, sent_at: new Date(message.date * 1000).toISOString(),
    }, { onConflict: 'chat_id,telegram_message_id,direction' });
    if (messageError) throw messageError;
    return jsonResponse({ ok: true });
  } catch (error) { return errorResponse(error); }
});
