import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createServiceClient, requireStaff } from '../_shared/auth.ts';
import { callWhatsAppGateway, sendWhatsAppTemplate } from '../_shared/whatsapp.ts';
import { normalizePhone } from '../_shared/whatsapp-logic.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const REVIEW_STATUSES = new Set(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'ERROR']);

const timingSafeEqual = (a: string, b: string) => {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index++) diff |= left[index] ^ right[index];
  return diff === 0;
};

// Scheduled runs authenticate with a dedicated server-side secret, never a key shipped to browsers.
const isScheduledRun = (req: Request) => {
  const secret = Deno.env.get('TEMPLATE_MONITOR_SECRET');
  const provided = req.headers.get('x-template-monitor-secret');
  return Boolean(secret && provided && timingSafeEqual(provided, secret));
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const scheduled = isScheduledRun(req);
    if (!scheduled) await requireStaff(req);

    const client = createServiceClient();
    const { data: versions, error: versionsError } = await client.from('whatsapp_template_versions')
      .select('*').eq('template_key', 'course_welcome').not('review_status', 'in', '(DRAFT,ERROR)');
    if (versionsError) throw versionsError;
    const version = versions?.find((candidate) => candidate.is_active);
    if (!version) return json({ ok: true, state: 'not_configured' });
    if (scheduled && version.last_checked_at && Date.now() - new Date(version.last_checked_at).getTime() < 4 * 60 * 1000) {
      return json({ ok: true, state: 'recently_checked' });
    }

    // Refresh every submitted version: enrollment uses the latest approved one, which may not be the active one.
    const templatesResponse = await callWhatsAppGateway('/message_templates?fields=id,name,status,language,category,components,rejected_reason&limit=100');
    const templates = Array.isArray(templatesResponse.data) ? templatesResponse.data as Record<string, unknown>[] : [];
    const checkedAt = new Date().toISOString();
    let activeStatus = version.review_status;
    for (const candidate of versions || []) {
      const remote = templates.find((item) => item.name === candidate.provider_template_name);
      const remoteStatus = String(remote?.status || candidate.review_status).toUpperCase();
      // Only statuses allowed by the review_status check constraint are stored.
      const reviewStatus = REVIEW_STATUSES.has(remoteStatus) ? remoteStatus : remoteStatus === 'DISABLED' ? 'PAUSED' : candidate.review_status;
      const rejectionReason = reviewStatus === 'REJECTED' ? String(remote?.rejected_reason || 'Meta requested changes') : null;
      const { error: updateVersionError } = await client.from('whatsapp_template_versions').update({
        review_status: reviewStatus, rejection_reason: rejectionReason, provider_template_id: remote?.id ? String(remote.id) : candidate.provider_template_id,
        provider_response: remote || candidate.provider_response, last_checked_at: checkedAt,
      }).eq('id', candidate.id);
      if (updateVersionError) throw updateVersionError;
      if (reviewStatus !== candidate.review_status || candidate.id === version.id) {
        await client.from('whatsapp_template_events').insert({ template_version_id: candidate.id, event_type: 'approval_checked', status: reviewStatus, details: { checked_at: checkedAt } });
      }
      if (candidate.id === version.id) activeStatus = reviewStatus;
    }
    if (activeStatus !== 'APPROVED') return json({ ok: true, state: activeStatus });

    // Optional one-time test send of a newly approved version, to a number configured server-side.
    const testPhone = normalizePhone(Deno.env.get('TEMPLATE_MONITOR_TEST_PHONE') || '');
    if (!testPhone) return json({ ok: true, state: activeStatus });
    const parameters = Array.isArray(version.sample_values) ? version.sample_values.map(String) : [];

    const { error: jobError } = await client.from('whatsapp_template_send_jobs').upsert({
      template_version_id: version.id, recipient_phone: testPhone, parameters,
    }, { onConflict: 'template_version_id,recipient_phone', ignoreDuplicates: true });
    if (jobError) throw jobError;
    const { data: queuedJob, error: queuedError } = await client.from('whatsapp_template_send_jobs')
      .select('*').eq('template_version_id', version.id).eq('recipient_phone', testPhone).single();
    if (queuedError) throw queuedError;
    if (queuedJob.status !== 'queued') return json({ ok: true, state: queuedJob.status });

    const { data: claimed, error: claimError } = await client.from('whatsapp_template_send_jobs').update({
      status: 'processing', claimed_at: new Date().toISOString(), attempt_count: queuedJob.attempt_count + 1,
    }).eq('id', queuedJob.id).eq('status', 'queued').select().maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return json({ ok: true, state: 'claimed_elsewhere' });

    try {
      const { messageId, response } = await sendWhatsAppTemplate(testPhone, version.provider_template_name, parameters, version.language);
      const { error: sentError } = await client.from('whatsapp_template_send_jobs').update({ status: 'accepted', provider_message_id: messageId,
        provider_response: response, sent_at: new Date().toISOString(), error_message: null }).eq('id', claimed.id).eq('status', 'processing');
      if (sentError) throw sentError;
      await client.from('whatsapp_template_events').insert({ template_version_id: version.id, send_job_id: claimed.id,
        event_type: 'send_accepted', status: 'accepted', details: { provider_message_id: messageId } });
      return json({ ok: true, state: 'accepted', providerMessageId: messageId });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message.slice(0, 2000) : 'Template send failed';
      await client.from('whatsapp_template_send_jobs').update({ status: 'failed', failed_at: new Date().toISOString(), error_message: message }).eq('id', claimed.id);
      await client.from('whatsapp_template_events').insert({ template_version_id: version.id, send_job_id: claimed.id,
        event_type: 'send_failed', status: 'failed', details: { error: message } });
      throw sendError;
    }
  } catch (error) {
    if (error instanceof Response) return new Response(error.body, { status: error.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const message = error instanceof Error ? error.message : 'Template monitor failed';
    console.error(message);
    return json({ error: message }, 500);
  }
});
