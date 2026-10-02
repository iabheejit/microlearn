CREATE TABLE public.whatsapp_progression_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.whatsapp_course_enrollments(id) ON DELETE CASCADE,
  provider_message_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.whatsapp_progression_events TO authenticated;
GRANT ALL ON public.whatsapp_progression_events TO service_role;
ALTER TABLE public.whatsapp_progression_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view WhatsApp progression events" ON public.whatsapp_progression_events FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator'));
CREATE INDEX whatsapp_progression_events_enrollment_idx ON public.whatsapp_progression_events (enrollment_id, created_at DESC);