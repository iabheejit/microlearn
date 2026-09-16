
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.23.8';
import { createServiceClient, requireStaff, requireUser } from '../_shared/auth.ts';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/whatsapp';

const RequestSchema = z.object({
  endpoint: z.enum(['getTemplates', 'getContacts', 'sendMessage', 'getAnalytics', 'getMessages']),
  phoneNumber: z.string().trim().min(7).max(20).optional(),
  templateName: z.string().trim().min(1).max(512).optional(),
  parameters: z.array(z.string().max(1024)).max(20).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

async function callWhatsApp(path: string, method = 'GET', body?: unknown) {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  const whatsappApiKey = Deno.env.get('WHATSAPP_API_KEY');

  if (!lovableApiKey || !whatsappApiKey) {
    throw new Error('WhatsApp Business connection is not configured');
  }

  const response = await fetch(`${GATEWAY_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      'X-Connection-Api-Key': whatsappApiKey,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const responseText = await response.text();
  if (!response.ok) {
    console.error(`WhatsApp gateway failed [${response.status}]: ${responseText}`);
    return { error: jsonResponse({ error: 'WhatsApp request failed', status: response.status, details: responseText }, response.status) };
  }

  try {
    return { data: JSON.parse(responseText) };
  } catch {
    return { data: {} };
  }
}

Deno.serve(async (req) => {
  console.log(`WhatsApp API request received: ${req.method} ${req.url}`);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log("Handling CORS preflight request");
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch (e) {
      console.error("Error parsing request body:", e);
      return jsonResponse({ error: 'Invalid request body' }, 400);
    }

    const parsed = RequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonResponse({ error: parsed.error.flatten().fieldErrors }, 400);
    }

    const requestBody = parsed.data;
    const { endpoint } = parsed.data;
    if (endpoint === 'sendMessage') await requireStaff(req);
    else await requireUser(req);
    console.log(`Processing endpoint: ${endpoint}`);

    // Handle different endpoints with the correct API paths including tenant ID
    switch (endpoint) {
      case 'getTemplates': {
        const result = await callWhatsApp('/message_templates?fields=id,name,status,language,components&limit=100');
        if (result.error) return result.error;
        const templates = Array.isArray(result.data?.data) ? result.data.data : [];
        return jsonResponse({ templates: templates.map((template: Record<string, unknown>) => {
          const components = Array.isArray(template.components) ? template.components : [];
          const body = components.find((component: Record<string, unknown>) => component.type === 'BODY');
          return {
            id: template.id ?? `${String(template.name)}-${String(template.language)}`,
            elementName: template.name,
            content: body && typeof body === 'object' && 'text' in body ? body.text : '',
            status: template.status,
            language: template.language,
            components,
          };
        }) });
      }

      case 'getContacts': {
        return jsonResponse({ contacts: [] });
      }

      case 'sendMessage': {
        const { phoneNumber, templateName, parameters } = requestBody;

        if (!phoneNumber || !templateName || !parameters) {
          return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const recipientDigits = phoneNumber.replace(/\D/g, '');
        const components = parameters.length > 0 ? [{
          type: 'body',
          parameters: parameters.map((text) => ({ type: 'text', text })),
        }] : [];
        const result = await callWhatsApp('/messages', 'POST', {
          messaging_product: 'whatsapp',
          to: recipientDigits,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'en_US' },
            components,
          },
        });
        if (result.error) return result.error;
        const providerMessageId = result.data?.messages?.[0]?.id ? String(result.data.messages[0].id) : null;
        const client = createServiceClient();
        const { error: contactError } = await client.from('whatsapp_contacts').upsert({ phone_number: recipientDigits }, { onConflict: 'phone_number' });
        if (contactError) throw contactError;
        const { error: historyError } = await client.from('whatsapp_messages').insert({
          phone_number: recipientDigits,
          direction: 'outgoing',
          template_name: templateName,
          content: parameters.length > 0 ? `${templateName}: ${parameters.join(', ')}` : templateName,
          provider_message_id: providerMessageId,
          status: 'accepted',
        });
        if (historyError) throw historyError;
        return jsonResponse(result.data);
      }

      case 'getAnalytics': {
        return jsonResponse({ messages: {}, conversations: {} });
      }

      case 'getMessages': {
        const { phoneNumber } = requestBody;
        
        if (!phoneNumber) {
          return new Response(JSON.stringify({ error: 'Phone number is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        const client = createServiceClient();
        const normalized = phoneNumber.replace(/\D/g, '');
        const { data: messages, error } = await client.from('whatsapp_messages').select('*').eq('phone_number', normalized).order('sent_at', { ascending: true });
        if (error) throw error;
        return jsonResponse({ messages: messages.map((message) => ({
          id: message.id,
          content: message.content,
          sent: message.direction === 'outgoing',
          timestamp: message.sent_at,
          status: message.status,
        })) });
      }

      default:
        console.error(`Endpoint not found: ${endpoint}`);
        return jsonResponse({ error: 'Endpoint not found' }, 404);
    }
  } catch (error) {
    console.error('Error processing request:', error);
    const message = error instanceof Error ? error.message : 'Unexpected WhatsApp error';
    return jsonResponse({ error: message }, 500);
  }
});
