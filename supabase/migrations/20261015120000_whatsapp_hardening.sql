-- Progression events: previously only defined under drizzle/migrations.
CREATE TABLE IF NOT EXISTS public.whatsapp_progression_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.whatsapp_course_enrollments(id) ON DELETE CASCADE,
  provider_message_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.whatsapp_progression_events TO authenticated;
GRANT ALL ON public.whatsapp_progression_events TO service_role;
ALTER TABLE public.whatsapp_progression_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can view WhatsApp progression events" ON public.whatsapp_progression_events;
CREATE POLICY "Staff can view WhatsApp progression events" ON public.whatsapp_progression_events FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator'));
CREATE INDEX IF NOT EXISTS whatsapp_progression_events_enrollment_idx ON public.whatsapp_progression_events (enrollment_id, created_at DESC);

-- Each event now acts as an outbox: the reply is decided and stored first, then sent,
-- so a retried callback re-sends the same reply instead of re-grading or re-advancing.
ALTER TABLE public.whatsapp_progression_events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed')),
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS response_text text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.whatsapp_progression_events ALTER COLUMN status SET DEFAULT 'pending';

-- One quiz attempt per learner message; removed together with an abandoned event.
ALTER TABLE public.whatsapp_quiz_attempts
  ADD COLUMN IF NOT EXISTS progression_event_id uuid UNIQUE REFERENCES public.whatsapp_progression_events(id) ON DELETE CASCADE;

-- Learner message history is staff-only (self-signup users get the learner role).
DROP POLICY IF EXISTS "Authenticated users can view WhatsApp history" ON public.whatsapp_messages;
CREATE POLICY "Staff can view WhatsApp history" ON public.whatsapp_messages FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator'));

DROP POLICY IF EXISTS "Authenticated users can view Telegram contacts" ON public.telegram_contacts;
CREATE POLICY "Staff can view Telegram contacts" ON public.telegram_contacts FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator'));

DROP POLICY IF EXISTS "Authenticated users can view Telegram messages" ON public.telegram_messages;
CREATE POLICY "Staff can view Telegram messages" ON public.telegram_messages FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator'));

-- Applies one progression decision atomically. The enrollment row lock serialises concurrent
-- replies from the same learner; a stale expected lesson raises so the caller can retry.
CREATE OR REPLACE FUNCTION public.apply_whatsapp_progression(
  p_event_id uuid,
  p_enrollment_id uuid,
  p_expected_resource_id uuid,
  p_next_resource_id uuid,
  p_progress integer,
  p_advance boolean,
  p_complete boolean,
  p_question_id uuid,
  p_submitted_answer text,
  p_is_correct boolean,
  p_outcome text,
  p_response_text text
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_current uuid;
BEGIN
  SELECT current_resource_id INTO v_current FROM public.whatsapp_course_enrollments
  WHERE id = p_enrollment_id AND status = 'active' AND awaiting_reply FOR UPDATE;
  IF NOT FOUND OR v_current IS DISTINCT FROM p_expected_resource_id THEN
    RAISE EXCEPTION 'progression_conflict' USING ERRCODE = '40001';
  END IF;

  IF p_question_id IS NOT NULL THEN
    INSERT INTO public.whatsapp_quiz_attempts (enrollment_id, question_id, submitted_answer, is_correct, attempt_number, progression_event_id)
    SELECT p_enrollment_id, p_question_id, p_submitted_answer, p_is_correct, COALESCE(MAX(attempt_number), 0) + 1, p_event_id
    FROM public.whatsapp_quiz_attempts WHERE enrollment_id = p_enrollment_id AND question_id = p_question_id;
  END IF;

  IF p_complete THEN
    UPDATE public.whatsapp_course_enrollments
    SET status = 'completed', progress_percentage = 100, awaiting_reply = false, completed_at = now()
    WHERE id = p_enrollment_id;
  ELSIF p_advance THEN
    UPDATE public.whatsapp_course_enrollments
    SET current_resource_id = p_next_resource_id, progress_percentage = p_progress
    WHERE id = p_enrollment_id;
  END IF;

  UPDATE public.whatsapp_progression_events SET outcome = p_outcome, response_text = p_response_text
  WHERE id = p_event_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'progression_event_missing' USING ERRCODE = '40001';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_whatsapp_progression(uuid, uuid, uuid, uuid, integer, boolean, boolean, uuid, text, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_whatsapp_progression(uuid, uuid, uuid, uuid, integer, boolean, boolean, uuid, text, boolean, text, text) TO service_role;
