-- WhatsApp template categories: Meta can approve a UTILITY request as MARKETING, or recategorize an
-- approved template later. Keep what staff requested next to Meta's category and correct_category.
ALTER TABLE public.whatsapp_template_versions
  ADD COLUMN IF NOT EXISTS requested_category text,
  ADD COLUMN IF NOT EXISTS correct_category text,
  ADD COLUMN IF NOT EXISTS previous_category text,
  ADD COLUMN IF NOT EXISTS category_updated_at timestamptz,
  -- Quick-reply button labels submitted with the template.
  ADD COLUMN IF NOT EXISTS buttons jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.whatsapp_template_versions SET requested_category = category WHERE requested_category IS NULL;

-- Meta reports more review states than the original list (appeals, disabled, deleted, …).
ALTER TABLE public.whatsapp_template_versions DROP CONSTRAINT IF EXISTS whatsapp_template_versions_review_status_check;
ALTER TABLE public.whatsapp_template_versions ADD CONSTRAINT whatsapp_template_versions_review_status_check
  CHECK (review_status IN ('DRAFT','PENDING','APPROVED','REJECTED','PAUSED','ERROR','IN_APPEAL','DISABLED',
    'PENDING_DELETION','DELETED','LIMIT_EXCEEDED','ARCHIVED'));
