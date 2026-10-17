-- WhatsApp template categories: Meta can approve a UTILITY request as MARKETING, or recategorize an
-- approved template later. Keep what staff requested next to Meta's category and correct_category.
ALTER TABLE public.whatsapp_template_versions
  ADD COLUMN IF NOT EXISTS requested_category text,
  ADD COLUMN IF NOT EXISTS correct_category text,
  ADD COLUMN IF NOT EXISTS previous_category text,
  ADD COLUMN IF NOT EXISTS category_updated_at timestamptz,
  -- Quick-reply button labels submitted with the template.
  ADD COLUMN IF NOT EXISTS buttons jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Time of the latest Meta update applied (webhook entry time or catalog sync); older retries are ignored.
  ADD COLUMN IF NOT EXISTS provider_event_at timestamptz;

UPDATE public.whatsapp_template_versions SET requested_category = category WHERE requested_category IS NULL;

-- Meta reports more review states than the original list (appeals, disabled, deleted, …).
ALTER TABLE public.whatsapp_template_versions DROP CONSTRAINT IF EXISTS whatsapp_template_versions_review_status_check;
ALTER TABLE public.whatsapp_template_versions ADD CONSTRAINT whatsapp_template_versions_review_status_check
  CHECK (review_status IN ('DRAFT','PENDING','APPROVED','REJECTED','PAUSED','ERROR','IN_APPEAL','DISABLED',
    'PENDING_DELETION','DELETED','LIMIT_EXCEEDED','ARCHIVED'));

-- Makes one version the active version of its template key in a single transaction, so a key never
-- ends up without an active version (one active version per key is enforced by a partial unique index).
CREATE OR REPLACE FUNCTION public.activate_whatsapp_template_version(p_version_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  SELECT template_key INTO v_key FROM public.whatsapp_template_versions WHERE id = p_version_id FOR UPDATE;
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Template version % not found', p_version_id;
  END IF;
  UPDATE public.whatsapp_template_versions SET is_active = false
  WHERE template_key = v_key AND is_active AND id <> p_version_id;
  UPDATE public.whatsapp_template_versions SET is_active = true WHERE id = p_version_id;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_whatsapp_template_version(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_whatsapp_template_version(uuid) TO service_role;
