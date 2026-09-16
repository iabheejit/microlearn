CREATE TABLE public.whatsapp_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  provider_template_name text NOT NULL UNIQUE,
  provider_template_id text,
  language text NOT NULL DEFAULT 'en_US',
  category text NOT NULL DEFAULT 'UTILITY',
  body text NOT NULL,
  sample_values jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_status text NOT NULL DEFAULT 'DRAFT' CHECK (review_status IN ('DRAFT','PENDING','APPROVED','REJECTED','PAUSED','ERROR')),
  rejection_reason text,
  provider_response jsonb,
  submitted_by uuid,
  submitted_at timestamptz,
  last_checked_at timestamptz,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_key, version)
);
GRANT SELECT ON public.whatsapp_template_versions TO authenticated;
GRANT ALL ON public.whatsapp_template_versions TO service_role;
ALTER TABLE public.whatsapp_template_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view WhatsApp template versions"
ON public.whatsapp_template_versions FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'content_creator'::public.app_role));

CREATE TABLE public.whatsapp_template_send_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_version_id uuid NOT NULL REFERENCES public.whatsapp_template_versions(id) ON DELETE CASCADE,
  recipient_phone text NOT NULL,
  parameters jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','accepted','sent','delivered','read','failed','paused')),
  attempt_count integer NOT NULL DEFAULT 0,
  provider_message_id text,
  provider_response jsonb,
  error_message text,
  claimed_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_version_id, recipient_phone)
);
GRANT SELECT ON public.whatsapp_template_send_jobs TO authenticated;
GRANT ALL ON public.whatsapp_template_send_jobs TO service_role;
ALTER TABLE public.whatsapp_template_send_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view WhatsApp template send jobs"
ON public.whatsapp_template_send_jobs FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'content_creator'::public.app_role));

CREATE TABLE public.whatsapp_template_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_version_id uuid REFERENCES public.whatsapp_template_versions(id) ON DELETE SET NULL,
  send_job_id uuid REFERENCES public.whatsapp_template_send_jobs(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  status text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.whatsapp_template_events TO authenticated;
GRANT ALL ON public.whatsapp_template_events TO service_role;
ALTER TABLE public.whatsapp_template_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view WhatsApp template events"
ON public.whatsapp_template_events FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'content_creator'::public.app_role));

ALTER TABLE public.whatsapp_messages
  ADD COLUMN delivered_at timestamptz,
  ADD COLUMN read_at timestamptz,
  ADD COLUMN failed_at timestamptz,
  ADD COLUMN status_error text;

CREATE UNIQUE INDEX whatsapp_template_versions_one_active_idx
ON public.whatsapp_template_versions (template_key) WHERE is_active;
CREATE INDEX whatsapp_template_versions_status_idx
ON public.whatsapp_template_versions (template_key, review_status, created_at DESC);
CREATE INDEX whatsapp_template_send_jobs_status_idx
ON public.whatsapp_template_send_jobs (status, created_at DESC);
CREATE INDEX whatsapp_template_send_jobs_provider_id_idx
ON public.whatsapp_template_send_jobs (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX whatsapp_template_events_created_idx
ON public.whatsapp_template_events (created_at DESC);

CREATE TRIGGER update_whatsapp_template_versions_updated_at
BEFORE UPDATE ON public.whatsapp_template_versions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_whatsapp_template_send_jobs_updated_at
BEFORE UPDATE ON public.whatsapp_template_send_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();