import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createServiceClient, requireStaff } from '../_shared/auth.ts';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/whatsapp';
const TARGET_PHONE = '919766072308';
const TARGET_PARAMETERS = ['Abheejit', 'WhatsApp Learning Essentials'];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function gateway(path: string, method = 'GET', body?: unknown) {
  const lovable = Deno.env.get('LOVABLE_API_KEY');
  const whatsapp = Deno.env.get('WHATSAPP_API_KEY');
  if (!lovable || !whatsapp) throw new Error('WhatsApp Business connection is not configured');
  const response = await fetch(`${GATEWAY_URL}${path}`, { method, headers: {
    Authorization: `Bearer ${lovable}`, 'X-Connection-Api-Key': whatsapp, 'Content-Type': 'application/json',
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(`WhatsApp request failed (${response.status}): ${text.slice(0, 1000)}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const authorization = req.headers.get('Authorization');
    const scheduled = req.headers.get('x-template-monitor') === 'scheduled'
      && authorization === `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`;
    if (!scheduled) await requireStaff(req);

    const client = createServiceClient();
    const { data: version, error: versionError } = await client.from('whatsapp_template_versions')
      .select('*').eq('template_key', 'course_welcome').eq('is_active', true).maybeSingle();
    if (versionError) throw versionError;
    if (!version) return json({ ok: true, state: 'not_configured' });
    if (scheduled && version.last_checked_at && Date.now() - new Date(version.last_checked_at).getTime() < 4 * 60 * 1000) {
      return json({ ok: true, state: 'recently_checked' });
    }

    const templatesResponse = await gateway('/message_templates?fields=id,name,status,language,category,components,rejected_reason&limit=100');
    const templates = Array.isArray(templatesResponse.data) ? templatesResponse.data as Record<string, unknown>[] : [];
    const remote = templates.find((item) => item.name === version.provider_template_name);
    const reviewStatus = String(remote?.status || version.review_status).toUpperCase();
    const rejectionReason = reviewStatus === 'REJECTED' ? String(remote?.rejected_reason || 'Meta requested changes') : null;
    const checkedAt = new Date().toISOString();
    const { error: updateVersionError } = await client.from('whatsapp_template_versions').update({
      review_status: reviewStatus, rejection_reason: rejectionReason, provider_template_id: remote?.id ? String(remote.id) : version.provider_template_id,
      provider_response: remote || version.provider_response, last_checked_at: checkedAt,
    }).eq('id', version.id);
    if (updateVersionError) throw updateVersionError;
    await client.from('whatsapp_template_events').insert({ template_version_id: version.id, event_type: 'approval_checked', status: reviewStatus, details: { checked_at: checkedAt } });
    if (reviewStatus !== 'APPROVED') return json({ ok: true, state: reviewStatus });

    const { data: job, error: jobError } = await client.from('whatsapp_template_send_jobs').upsert({
      template_version_id: version.id, recipient_phone: TARGET_PHONE, parameters: TARGET_PARAMETERS,
    }, { onConflict: 'template_version_id,recipient_phone', ignoreDuplicates: true }).select().maybeSingle();
    if (jobError) throw jobError;
    const { data: queuedJob, error: queuedError } = job
      ? { data: job, error: null }
      : await client.from('whatsapp_template_send_jobs').select('*').eq('template_version_id', version.id).eq('recipient_phone', TARGET_PHONE).single();
    if (queuedError) throw queuedError;
    if (!queuedJob || queuedJob.status !== 'queued') return json({ ok: true, state: queuedJob?.status || 'already_processed' });

    const claimedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await client.from('whatsapp_template_send_jobs').update({
      status: 'processing', claimed_at: claimedAt, attempt_count: queuedJob.attempt_count + 1,
    }).eq('id', queuedJob.id).eq('status', 'queued').select().maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return json({ ok: true, state: 'claimed_elsewhere' });

    try {
      const components = TARGET_PARAMETERS.length ? [{ type: 'body', parameters: TARGET_PARAMETERS.map((text) => ({ type: 'text', text })) }] : [];
      const response = await gateway('/messages', 'POST', { messaging_product: 'whatsapp', to: TARGET_PHONE, type: 'template', template: {
        name: version.provider_template_name, language: { code: version.language }, components,
      } });
      const messages = Array.isArray(response.messages) ? response.messages as Record<string, unknown>[] : [];
      const providerMessageId = messages[0]?.id ? String(messages[0].id) : null;
      const sentAt = new Date().toISOString();
      await client.from('whatsapp_contacts').upsert({ phone_number: TARGET_PHONE }, { onConflict: 'phone_number' });
      const { error: messageError } = await client.from('whatsapp_messages').insert({ phone_number: TARGET_PHONE, direction: 'outgoing',
        template_name: version.provider_template_name, content: `${version.provider_template_name}: ${TARGET_PARAMETERS.join(', ')}`,
        provider_message_id: providerMessageId, status: 'accepted', sent_at: sentAt });
      if (messageError) throw messageError;
      const { error: sentError } = await client.from('whatsapp_template_send_jobs').update({ status: 'accepted', provider_message_id: providerMessageId,
        provider_response: response, sent_at: sentAt, error_message: null }).eq('id', claimed.id);
      if (sentError) throw sentError;
      await client.from('whatsapp_template_events').insert({ template_version_id: version.id, send_job_id: claimed.id,
        event_type: 'send_accepted', status: 'accepted', details: { provider_message_id: providerMessageId, recipient_phone: TARGET_PHONE } });
      return json({ ok: true, state: 'accepted', providerMessageId });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message.slice(0, 2000) : 'Template send failed';
      await client.from('whatsapp_template_send_jobs').update({ status: 'failed', failed_at: new Date().toISOString(), error_message: message }).eq('id', claimed.id);
      await client.from('whatsapp_template_events').insert({ template_version_id: version.id, send_job_id: claimed.id,
        event_type: 'send_failed', status: 'failed', details: { error: message } });
      throw sendError;
    }
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Template monitor failed';
    console.error(message);
    return json({ error: message }, 500);
  }
});