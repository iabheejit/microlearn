
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.23.8';
import { createServiceClient, requireStaff, requireUser } from '../_shared/auth.ts';
import { orderedLessons } from '../_shared/course-progression.ts';
import { sendWhatsAppText } from '../_shared/whatsapp.ts';
import { errorResponse } from '../_shared/responses.ts';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/whatsapp';

const RequestSchema = z.object({
  endpoint: z.enum(['getTemplates', 'getContacts', 'sendMessage', 'sendReply', 'getAnalytics', 'getMessages', 'submitTemplateVersion', 'enrollLearner', 'getCourseProgress']),
  courseId: z.string().uuid().optional(),
  learnerName: z.string().trim().min(1).max(120).optional(),
  phoneNumber: z.string().trim().min(7).max(20).optional(),
  templateName: z.string().trim().min(1).max(512).optional(),
  parameters: z.array(z.string().max(1024)).max(20).optional(),
  message: z.string().trim().min(1).max(4096).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  body: z.string().trim().min(20).max(1024).optional(),
  sampleValues: z.array(z.string().trim().min(1).max(256)).max(10).optional(),
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
    const staff = ['sendMessage', 'sendReply', 'submitTemplateVersion', 'enrollLearner'].includes(endpoint)
      ? await requireStaff(req)
      : null;
    if (!staff) await requireUser(req);
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

      case 'submitTemplateVersion': {
        const { body, sampleValues = [] } = requestBody;
        if (!body) return jsonResponse({ error: 'Template body is required' }, 400);
        const placeholders = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
        const expected = placeholders.length ? Math.max(...placeholders) : 0;
        if (new Set(placeholders).size !== expected || sampleValues.length !== expected) {
          return jsonResponse({ error: `Provide one sample value for each placeholder from {{1}} to {{${expected}}}.` }, 400);
        }

        const client = createServiceClient();
        const { data: latest, error: latestError } = await client.from('whatsapp_template_versions')
          .select('version').eq('template_key', 'course_welcome').order('version', { ascending: false }).limit(1).maybeSingle();
        if (latestError) throw latestError;
        const version = (latest?.version || 0) + 1;
        const providerName = version === 1 ? 'course_welcome' : `course_welcome_v${version}`;
        const providerBody = {
          name: providerName,
          language: 'en_US',
          category: 'UTILITY',
          components: [{ type: 'BODY', text: body, ...(expected ? { example: { body_text: [sampleValues] } } : {}) }],
        };
        const result = await callWhatsApp('/message_templates', 'POST', providerBody);
        if (result.error) return result.error;
        const providerId = result.data?.id ? String(result.data.id) : null;
        await client.from('whatsapp_template_versions').update({ is_active: false }).eq('template_key', 'course_welcome');
        const { data: created, error: createError } = await client.from('whatsapp_template_versions').insert({
          template_key: 'course_welcome', version, provider_template_name: providerName,
          provider_template_id: providerId, language: 'en_US', category: 'UTILITY', body,
          sample_values: sampleValues, review_status: 'PENDING', provider_response: result.data,
          submitted_by: staff?.user.id, submitted_at: new Date().toISOString(), last_checked_at: new Date().toISOString(), is_active: true,
        }).select().single();
        if (createError) throw createError;
        const { error: eventError } = await client.from('whatsapp_template_events').insert({
          template_version_id: created.id, event_type: 'submitted', status: 'PENDING', actor_id: staff?.user.id,
          details: { provider_template_name: providerName, provider_template_id: providerId },
        });
        if (eventError) throw eventError;
        return jsonResponse({ version: created });
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

      case 'sendReply': {
        const { phoneNumber, message } = requestBody;
        if (!phoneNumber || !message) return jsonResponse({ error: 'Phone number and message are required' }, 400);
        const recipientDigits = phoneNumber.replace(/\D/g, '');
        const client = createServiceClient();
        const { data: latestIncoming, error: incomingError } = await client.from('whatsapp_messages')
          .select('sent_at').eq('phone_number', recipientDigits).eq('direction', 'incoming').order('sent_at', { ascending: false }).limit(1).maybeSingle();
        if (incomingError) throw incomingError;
        if (!latestIncoming || Date.now() - new Date(latestIncoming.sent_at).getTime() > 24 * 60 * 60 * 1000) {
          return jsonResponse({ error: 'The 24-hour reply window is closed. Send an approved template instead.' }, 409);
        }
        const result = await callWhatsApp('/messages', 'POST', {
          messaging_product: 'whatsapp', to: recipientDigits, type: 'text', text: { body: message },
        });
        if (result.error) return result.error;
        const providerMessageId = result.data?.messages?.[0]?.id ? String(result.data.messages[0].id) : null;
        const { error: contactError } = await client.from('whatsapp_contacts').upsert({ phone_number: recipientDigits }, { onConflict: 'phone_number' });
        if (contactError) throw contactError;
        const { error: historyError } = await client.from('whatsapp_messages').insert({
          phone_number: recipientDigits, direction: 'outgoing', content: message,
          provider_message_id: providerMessageId, status: 'accepted',
        });
        if (historyError) throw historyError;
        return jsonResponse(result.data);
      }

      case 'enrollLearner': {
        const { courseId, phoneNumber, learnerName } = requestBody;
        if (!courseId || !phoneNumber || !learnerName) return jsonResponse({ error: 'Course, learner name, and phone number are required' }, 400);
        const recipientDigits = phoneNumber.replace(/\D/g, '');
        const client = createServiceClient();
        const resources = await orderedLessons(courseId);
        if (!resources.length) return jsonResponse({ error: 'Add course lessons before enrolling a learner' }, 409);
        const { data: course, error: courseError } = await client.from('courses').select('title').eq('id', courseId).single();
        if (courseError) throw courseError;
        const existing = await client.from('whatsapp_course_enrollments').select('id,status').eq('course_id', courseId).eq('phone_number', recipientDigits).maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data?.status === 'active') return jsonResponse({ error: 'This learner is already active in this course.' }, 409);
        const { data: activeTemplate, error: templateError } = await client.from('whatsapp_template_versions')
          .select('provider_template_name,review_status').eq('template_key', 'course_welcome').eq('is_active', true).single();
        if (templateError) throw templateError;
        if (activeTemplate.review_status !== 'APPROVED') return jsonResponse({ error: 'The course welcome template is not approved yet.' }, 409);
        const result = await callWhatsApp('/messages', 'POST', {
          messaging_product: 'whatsapp', to: recipientDigits, type: 'template',
          template: { name: activeTemplate.provider_template_name, language: { code: 'en_US' }, components: [{ type: 'body', parameters: [learnerName, course.title].map((text) => ({ type: 'text', text })) }] },
        });
        if (result.error) return result.error;
        const messageId = result.data?.messages?.[0]?.id;
        if (typeof messageId !== 'string') return jsonResponse({ error: 'WhatsApp did not return a message ID' }, 502);
        const { error: historyError } = await client.from('whatsapp_messages').upsert({
          phone_number: recipientDigits, direction: 'outgoing', template_name: activeTemplate.provider_template_name,
          content: `${activeTemplate.provider_template_name}: ${learnerName}, ${course.title}`, provider_message_id: messageId, status: 'accepted',
        }, { onConflict: 'provider_message_id', ignoreDuplicates: true });
        if (historyError) throw historyError;
        const { error: contactError } = await client.from('whatsapp_contacts').upsert({ phone_number: recipientDigits }, { onConflict: 'phone_number' });
        if (contactError) throw contactError;
        const { data: enrollment, error: enrollmentError } = await client.from('whatsapp_course_enrollments').upsert({
          course_id: courseId, phone_number: recipientDigits, learner_name: learnerName,
          current_resource_id: null, status: 'active', progress_percentage: 0,
          awaiting_reply: true, completed_at: null, created_by: staff?.user.id,
        }, { onConflict: 'course_id,phone_number' }).select().single();
        if (enrollmentError) throw enrollmentError;
        return jsonResponse({ enrollment, messageId });
      }

      case 'getCourseProgress': {
        const { courseId, phoneNumber } = requestBody;
        if (!courseId) return jsonResponse({ error: 'Course is required' }, 400);
        const client = createServiceClient();
        let query = client.from('whatsapp_course_enrollments').select('*,course_certificates(*)').eq('course_id', courseId).order('updated_at', { ascending: false });
        if (phoneNumber) query = query.eq('phone_number', phoneNumber.replace(/\D/g, ''));
        const { data, error } = await query;
        if (error) throw error;
        return jsonResponse({ enrollments: data || [] });
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
    return errorResponse(error);
  }
});
