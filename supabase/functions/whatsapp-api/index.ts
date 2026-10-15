import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.23.8';
import { requireStaff } from '../_shared/auth.ts';
import { orderedLessons } from '../_shared/course-progression.ts';
import { callWhatsAppGateway, sendWhatsAppTemplate, sendWhatsAppText, WhatsAppGatewayError } from '../_shared/whatsapp.ts';
import { normalizePhone, templatePlaceholderCount, WELCOME_TEMPLATE_PLACEHOLDERS } from '../_shared/whatsapp-logic.ts';
import { errorResponse } from '../_shared/responses.ts';

const RequestSchema = z.object({
  endpoint: z.enum(['getTemplates', 'getContacts', 'sendMessage', 'sendReply', 'getAnalytics', 'getMessages', 'submitTemplateVersion', 'enrollLearner', 'getCourseProgress']),
  courseId: z.string().uuid().optional(),
  learnerName: z.string().trim().min(1).max(120).optional(),
  phoneNumber: z.string().trim().min(7).max(20).optional(),
  templateName: z.string().trim().min(1).max(512).optional(),
  parameters: z.array(z.string().max(1024)).max(20).optional(),
  message: z.string().trim().min(1).max(4096).optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  body: z.string().trim().min(20).max(1024).optional(),
  sampleValues: z.array(z.string().trim().min(1).max(256)).max(10).optional(),
});

const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const invalidPhone = () => jsonResponse({ error: 'Enter the phone number with its country code (8 to 15 digits).' }, 400);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400);
    }

    const parsed = RequestSchema.safeParse(rawBody);
    if (!parsed.success) return jsonResponse({ error: parsed.error.flatten().fieldErrors }, 400);

    // Every endpoint exposes learner data or acts on the WhatsApp account, so all require staff.
    const { client, user } = await requireStaff(req);
    const requestBody = parsed.data;
    const phone = requestBody.phoneNumber ? normalizePhone(requestBody.phoneNumber) : undefined;
    if (phone === null) return invalidPhone();

    switch (requestBody.endpoint) {
      case 'getTemplates': {
        const result = await callWhatsAppGateway('/message_templates?fields=id,name,status,language,components&limit=100');
        const templates = Array.isArray(result.data) ? result.data as Record<string, unknown>[] : [];
        return jsonResponse({ templates: templates.map((template) => {
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
        const [{ data: contacts, error: contactsError }, { data: messages, error: messagesError }] = await Promise.all([
          client.from('whatsapp_contacts').select('id,phone_number,name,created_at,updated_at'),
          client.from('whatsapp_messages').select('phone_number,direction,status,sent_at').order('sent_at', { ascending: false }).limit(10000),
        ]);
        if (contactsError) throw contactsError;
        if (messagesError) throw messagesError;
        const summaries = new Map<string, { total: number; last?: { direction: string; status: string; sent_at: string } }>();
        for (const message of messages || []) {
          const summary = summaries.get(message.phone_number) || { total: 0 };
          summary.total += 1;
          summary.last ||= message;
          summaries.set(message.phone_number, summary);
        }
        return jsonResponse({ contacts: (contacts || []).map((contact) => {
          const summary = summaries.get(contact.phone_number);
          return {
            ...contact,
            lastInteractionAt: summary?.last?.sent_at ?? null,
            lastDirection: summary?.last?.direction ?? null,
            lastStatus: summary?.last?.status ?? null,
            totalMessages: summary?.total ?? 0,
          };
        }).sort((a, b) => String(b.lastInteractionAt ?? '').localeCompare(String(a.lastInteractionAt ?? ''))) });
      }

      case 'submitTemplateVersion': {
        const { body, sampleValues = [] } = requestBody;
        if (!body) return jsonResponse({ error: 'Template body is required' }, 400);
        if (templatePlaceholderCount(body) !== WELCOME_TEMPLATE_PLACEHOLDERS || sampleValues.length !== WELCOME_TEMPLATE_PLACEHOLDERS) {
          return jsonResponse({ error: 'The welcome template must use exactly {{1}} (learner name) and {{2}} (course title), with one sample value for each.' }, 400);
        }

        const { data: latest, error: latestError } = await client.from('whatsapp_template_versions')
          .select('version').eq('template_key', 'course_welcome').order('version', { ascending: false }).limit(1).maybeSingle();
        if (latestError) throw latestError;
        const version = (latest?.version || 0) + 1;
        const providerName = version === 1 ? 'course_welcome' : `course_welcome_v${version}`;
        // Claim the version number locally before submitting, so concurrent submissions cannot
        // both reach Meta under the same name.
        const { data: draft, error: draftError } = await client.from('whatsapp_template_versions').insert({
          template_key: 'course_welcome', version, provider_template_name: providerName, language: 'en_US', category: 'UTILITY',
          body, sample_values: sampleValues, review_status: 'DRAFT', submitted_by: user.id, is_active: false,
        }).select().single();
        if (draftError) {
          if (draftError.code === '23505') return jsonResponse({ error: 'Another version was just submitted. Refresh and try again.' }, 409);
          throw draftError;
        }

        let result: Record<string, unknown>;
        try {
          result = await callWhatsAppGateway('/message_templates', 'POST', {
            name: providerName, language: 'en_US', category: 'UTILITY',
            components: [{ type: 'BODY', text: body, example: { body_text: [sampleValues] } }],
          });
        } catch (submitError) {
          const message = submitError instanceof Error ? submitError.message.slice(0, 2000) : 'Template submission failed';
          await client.from('whatsapp_template_versions').update({ review_status: 'ERROR', rejection_reason: message }).eq('id', draft.id);
          await client.from('whatsapp_template_events').insert({ template_version_id: draft.id, event_type: 'submit_failed', status: 'ERROR', actor_id: user.id, details: { error: message } });
          throw submitError;
        }

        const providerId = result.id ? String(result.id) : null;
        const { error: deactivateError } = await client.from('whatsapp_template_versions').update({ is_active: false })
          .eq('template_key', 'course_welcome').neq('id', draft.id);
        if (deactivateError) throw deactivateError;
        const now = new Date().toISOString();
        const { data: created, error: createError } = await client.from('whatsapp_template_versions').update({
          provider_template_id: providerId, review_status: 'PENDING', provider_response: result,
          submitted_at: now, last_checked_at: now, is_active: true,
        }).eq('id', draft.id).select().single();
        if (createError) throw createError;
        const { error: eventError } = await client.from('whatsapp_template_events').insert({
          template_version_id: created.id, event_type: 'submitted', status: 'PENDING', actor_id: user.id,
          details: { provider_template_name: providerName, provider_template_id: providerId },
        });
        if (eventError) throw eventError;
        return jsonResponse({ version: created });
      }

      case 'sendMessage': {
        const { templateName, parameters } = requestBody;
        if (!phone || !templateName || !parameters) return jsonResponse({ error: 'Missing required parameters' }, 400);
        const { messageId, response } = await sendWhatsAppTemplate(phone, templateName, parameters);
        return jsonResponse({ ...response, messageId });
      }

      case 'sendReply': {
        const { message } = requestBody;
        if (!phone || !message) return jsonResponse({ error: 'Phone number and message are required' }, 400);
        const { data: latestIncoming, error: incomingError } = await client.from('whatsapp_messages')
          .select('sent_at').eq('phone_number', phone).eq('direction', 'incoming').order('sent_at', { ascending: false }).limit(1).maybeSingle();
        if (incomingError) throw incomingError;
        if (!latestIncoming || Date.now() - new Date(latestIncoming.sent_at).getTime() > REPLY_WINDOW_MS) {
          return jsonResponse({ error: 'The 24-hour reply window is closed. Send an approved template instead.' }, 409);
        }
        const messageId = await sendWhatsAppText(phone, message);
        return jsonResponse({ messageId });
      }

      case 'enrollLearner': {
        const { courseId, learnerName } = requestBody;
        if (!courseId || !phone || !learnerName) return jsonResponse({ error: 'Course, learner name, and phone number are required' }, 400);
        const resources = await orderedLessons(courseId);
        if (!resources.length) return jsonResponse({ error: 'Add course lessons before enrolling a learner' }, 409);
        const { data: course, error: courseError } = await client.from('courses').select('title').eq('id', courseId).single();
        if (courseError) throw courseError;

        const { data: activeEnrollments, error: activeError } = await client.from('whatsapp_course_enrollments')
          .select('id,course_id').eq('phone_number', phone).eq('status', 'active');
        if (activeError) throw activeError;
        if (activeEnrollments?.some((enrollment) => enrollment.course_id === courseId)) {
          return jsonResponse({ error: 'This learner is already active in this course.' }, 409);
        }
        // Replies are matched to a course by phone number, so a learner can only be active in one at a time.
        if (activeEnrollments?.length) {
          return jsonResponse({ error: 'This learner is already active in another WhatsApp course. Complete or pause it first.' }, 409);
        }
        const { data: existing, error: existingError } = await client.from('whatsapp_course_enrollments')
          .select('id,status').eq('course_id', courseId).eq('phone_number', phone).maybeSingle();
        if (existingError) throw existingError;
        if (existing?.status === 'completed') return jsonResponse({ error: 'This learner has already completed this course.' }, 409);

        const { data: approvedTemplates, error: templateError } = await client.from('whatsapp_template_versions')
          .select('provider_template_name,language').eq('template_key', 'course_welcome').eq('review_status', 'APPROVED')
          .order('version', { ascending: false }).limit(1);
        if (templateError) throw templateError;
        const activeTemplate = approvedTemplates?.[0];
        if (!activeTemplate) return jsonResponse({ error: 'The course welcome template is not approved yet.' }, 409);

        // Record the enrollment before sending, but keep it out of reply matching until the welcome is accepted.
        const { data: enrollment, error: enrollmentError } = await client.from('whatsapp_course_enrollments').upsert({
          course_id: courseId, phone_number: phone, learner_name: learnerName,
          current_resource_id: null, status: 'active', progress_percentage: 0,
          awaiting_reply: false, completed_at: null, created_by: user.id,
        }, { onConflict: 'course_id,phone_number' }).select().single();
        if (enrollmentError) throw enrollmentError;

        let messageId: string;
        try {
          ({ messageId } = await sendWhatsAppTemplate(phone, activeTemplate.provider_template_name, [learnerName, course.title], activeTemplate.language));
        } catch (sendError) {
          await client.from('whatsapp_course_enrollments').update({ status: 'paused' }).eq('id', enrollment.id);
          throw sendError;
        }
        const { data: ready, error: readyError } = await client.from('whatsapp_course_enrollments')
          .update({ awaiting_reply: true }).eq('id', enrollment.id).select().single();
        if (readyError) throw readyError;
        return jsonResponse({ enrollment: ready, messageId });
      }

      case 'getCourseProgress': {
        const { courseId } = requestBody;
        if (!courseId) return jsonResponse({ error: 'Course is required' }, 400);
        let query = client.from('whatsapp_course_enrollments').select('*,course_certificates(*)').eq('course_id', courseId).order('updated_at', { ascending: false });
        if (phone) query = query.eq('phone_number', phone);
        const { data, error } = await query;
        if (error) throw error;
        return jsonResponse({ enrollments: data || [] });
      }

      case 'getAnalytics': {
        // Portal-observed metrics from stored messages and callbacks, not Meta account analytics.
        const start = requestBody.startDate ? `${requestBody.startDate}T00:00:00Z` : new Date(Date.now() - 30 * 86400000).toISOString();
        const end = requestBody.endDate ? `${requestBody.endDate}T23:59:59.999Z` : new Date().toISOString();
        const [messagesResult, callbacksResult, enrollmentsResult] = await Promise.all([
          client.from('whatsapp_messages').select('phone_number,direction,status,sent_at').gte('sent_at', start).lte('sent_at', end).order('sent_at').limit(20000),
          client.from('whatsapp_webhook_callbacks').select('status').gte('received_at', start).lte('received_at', end).limit(20000),
          client.from('whatsapp_course_enrollments').select('status'),
        ]);
        const error = messagesResult.error || callbacksResult.error || enrollmentsResult.error;
        if (error) throw error;
        const messages = messagesResult.data || [];
        const countBy = <T,>(rows: T[], key: (row: T) => string) => rows.reduce<Record<string, number>>((result, row) => {
          result[key(row)] = (result[key(row)] || 0) + 1;
          return result;
        }, {});
        const outgoing = messages.filter((message) => message.direction === 'outgoing');
        const incoming = messages.filter((message) => message.direction === 'incoming');
        // Average time from a learner message to the next outgoing message to the same number.
        const pending = new Map<string, number>();
        const responseTimes: number[] = [];
        for (const message of messages) {
          const at = new Date(message.sent_at).getTime();
          if (message.direction === 'incoming') {
            if (!pending.has(message.phone_number)) pending.set(message.phone_number, at);
          } else if (pending.has(message.phone_number)) {
            responseTimes.push(at - (pending.get(message.phone_number) as number));
            pending.delete(message.phone_number);
          }
        }
        return jsonResponse({
          source: 'portal_observed',
          range: { start, end },
          messages: {
            total: messages.length,
            incoming: incoming.length,
            outgoing: outgoing.length,
            outgoingByStatus: countBy(outgoing, (message) => message.status),
            byDate: countBy(messages, (message) => message.sent_at.slice(0, 10)),
          },
          conversations: {
            uniqueContacts: new Set(messages.map((message) => message.phone_number)).size,
            averageResponseSeconds: responseTimes.length ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length / 1000) : null,
          },
          callbacks: countBy(callbacksResult.data || [], (callback) => callback.status),
          enrollments: countBy(enrollmentsResult.data || [], (enrollment) => enrollment.status),
        });
      }

      case 'getMessages': {
        if (!phone) return jsonResponse({ error: 'Phone number is required' }, 400);
        const { data: messages, error } = await client.from('whatsapp_messages').select('*').eq('phone_number', phone).order('sent_at', { ascending: true });
        if (error) throw error;
        return jsonResponse({ messages: messages.map((message) => ({
          id: message.id,
          content: message.content,
          sent: message.direction === 'outgoing',
          timestamp: message.sent_at,
          status: message.status,
        })) });
      }
    }
  } catch (error) {
    if (error instanceof WhatsAppGatewayError) {
      console.error(error.message);
      const status = error.status >= 400 && error.status < 600 ? error.status : 502;
      return jsonResponse({ error: 'WhatsApp request failed', status: error.status, details: error.details.slice(0, 1500) }, status);
    }
    return errorResponse(error);
  }
});
