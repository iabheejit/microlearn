-- Course pacing: lessons and questions as separate steps, Next/Pause, and days unlocked on a schedule.

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS pacing_mode text NOT NULL DEFAULT 'immediate'
    CHECK (pacing_mode IN ('immediate', 'fixed_time', 'after_completion')),
  ADD COLUMN IF NOT EXISTS pacing_gap_days integer NOT NULL DEFAULT 1 CHECK (pacing_gap_days BETWEEN 1 AND 30),
  ADD COLUMN IF NOT EXISTS pacing_unlock_time text NOT NULL DEFAULT '09:00'
    CHECK (pacing_unlock_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD COLUMN IF NOT EXISTS pacing_timezone text NOT NULL DEFAULT 'UTC',
  -- 0 turns pause reminders off.
  ADD COLUMN IF NOT EXISTS pause_reminder_hours integer NOT NULL DEFAULT 24 CHECK (pause_reminder_hours BETWEEN 0 AND 168),
  -- Approved template that reopens the 24-hour window for day unlocks and pause reminders.
  ADD COLUMN IF NOT EXISTS whatsapp_nudge_template_name text,
  ADD COLUMN IF NOT EXISTS whatsapp_nudge_template_language text;

-- Shared state columns on both enrollment kinds. state_version guards every step against races.
ALTER TABLE public.whatsapp_course_enrollments
  ADD COLUMN IF NOT EXISTS current_step text NOT NULL DEFAULT 'lesson' CHECK (current_step IN ('lesson', 'question')),
  ADD COLUMN IF NOT EXISTS state_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS pause_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_unlock_at timestamptz,
  ADD COLUMN IF NOT EXISTS nudge_sent_at timestamptz;
ALTER TABLE public.web_course_enrollments
  ADD COLUMN IF NOT EXISTS current_step text NOT NULL DEFAULT 'lesson' CHECK (current_step IN ('lesson', 'question')),
  ADD COLUMN IF NOT EXISTS state_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS pause_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_unlock_at timestamptz,
  ADD COLUMN IF NOT EXISTS nudge_sent_at timestamptz;

-- Before this change a WhatsApp lesson and its question arrived together, so learners part-way through a
-- lesson that has a quiz are already answering it.
UPDATE public.whatsapp_course_enrollments e SET current_step = 'question'
WHERE e.status = 'active' AND e.current_resource_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.course_quiz_questions q WHERE q.resource_id = e.current_resource_id);

CREATE INDEX IF NOT EXISTS whatsapp_course_enrollments_unlock_idx
  ON public.whatsapp_course_enrollments (next_unlock_at) WHERE status = 'active' AND next_unlock_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_course_enrollments_paused_idx
  ON public.whatsapp_course_enrollments (paused_at) WHERE status = 'active' AND paused_at IS NOT NULL;

-- Outbox: a step can send several messages (feedback, lesson, buttons). They are stored with the decision
-- and sent in order; delivered_count lets a retry resume after the last message WhatsApp accepted.
ALTER TABLE public.whatsapp_progression_events
  ADD COLUMN IF NOT EXISTS response_messages jsonb,
  ADD COLUMN IF NOT EXISTS delivered_count integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS whatsapp_progression_events_pending_idx
  ON public.whatsapp_progression_events (created_at) WHERE status = 'pending';

-- Applies one WhatsApp course step atomically: version check, quiz attempt, new state and outbox messages.
CREATE OR REPLACE FUNCTION public.apply_whatsapp_step(
  p_event_id uuid,
  p_enrollment_id uuid,
  p_expected_version integer,
  p_state jsonb,
  p_attempt jsonb,
  p_outcome text,
  p_messages jsonb
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_version integer;
BEGIN
  SELECT state_version INTO v_version FROM public.whatsapp_course_enrollments WHERE id = p_enrollment_id FOR UPDATE;
  IF NOT FOUND OR v_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'progression_conflict' USING ERRCODE = '40001';
  END IF;

  IF p_attempt IS NOT NULL THEN
    INSERT INTO public.whatsapp_quiz_attempts (enrollment_id, question_id, submitted_answer, is_correct, attempt_number, progression_event_id)
    SELECT p_enrollment_id, (p_attempt->>'question_id')::uuid, p_attempt->>'answer', (p_attempt->>'correct')::boolean,
      COALESCE(MAX(attempt_number), 0) + 1, p_event_id
    FROM public.whatsapp_quiz_attempts WHERE enrollment_id = p_enrollment_id AND question_id = (p_attempt->>'question_id')::uuid;
  END IF;

  UPDATE public.whatsapp_course_enrollments SET
    status = p_state->>'status',
    current_resource_id = (p_state->>'current_resource_id')::uuid,
    current_step = p_state->>'current_step',
    progress_percentage = (p_state->>'progress_percentage')::integer,
    paused_at = (p_state->>'paused_at')::timestamptz,
    pause_reminder_sent_at = (p_state->>'pause_reminder_sent_at')::timestamptz,
    next_unlock_at = (p_state->>'next_unlock_at')::timestamptz,
    nudge_sent_at = (p_state->>'nudge_sent_at')::timestamptz,
    completed_at = (p_state->>'completed_at')::timestamptz,
    awaiting_reply = (p_state->>'status') = 'active',
    state_version = v_version + 1
  WHERE id = p_enrollment_id;

  UPDATE public.whatsapp_progression_events
  SET outcome = p_outcome, response_messages = p_messages,
      response_text = (SELECT string_agg(m->>'content', E'\n---\n') FROM jsonb_array_elements(p_messages) m)
  WHERE id = p_event_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'progression_event_missing' USING ERRCODE = '40001';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_whatsapp_step(uuid, uuid, integer, jsonb, jsonb, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_whatsapp_step(uuid, uuid, integer, jsonb, jsonb, text, jsonb) TO service_role;

-- Applies one web course step atomically and issues the certificate on completion.
CREATE OR REPLACE FUNCTION public.apply_web_step(
  p_enrollment_id uuid,
  p_user_id uuid,
  p_expected_version integer,
  p_state jsonb,
  p_attempt jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_version integer;
  v_course uuid;
  v_code text;
BEGIN
  SELECT state_version, course_id INTO v_version, v_course FROM public.web_course_enrollments
  WHERE id = p_enrollment_id AND user_id = p_user_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND OR v_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'progression_conflict' USING ERRCODE = '40001';
  END IF;

  IF p_attempt IS NOT NULL THEN
    INSERT INTO public.web_quiz_attempts (enrollment_id, question_id, submitted_answer, is_correct, attempt_number)
    SELECT p_enrollment_id, (p_attempt->>'question_id')::uuid, p_attempt->>'answer', (p_attempt->>'correct')::boolean,
      COALESCE(MAX(attempt_number), 0) + 1
    FROM public.web_quiz_attempts WHERE enrollment_id = p_enrollment_id AND question_id = (p_attempt->>'question_id')::uuid;
  END IF;

  UPDATE public.web_course_enrollments SET
    status = p_state->>'status',
    current_resource_id = (p_state->>'current_resource_id')::uuid,
    current_step = p_state->>'current_step',
    progress_percentage = (p_state->>'progress_percentage')::integer,
    paused_at = (p_state->>'paused_at')::timestamptz,
    pause_reminder_sent_at = (p_state->>'pause_reminder_sent_at')::timestamptz,
    next_unlock_at = (p_state->>'next_unlock_at')::timestamptz,
    nudge_sent_at = (p_state->>'nudge_sent_at')::timestamptz,
    completed_at = (p_state->>'completed_at')::timestamptz,
    state_version = v_version + 1
  WHERE id = p_enrollment_id;

  IF (p_state->>'status') = 'completed' THEN
    INSERT INTO public.web_course_certificates (enrollment_id, course_id, user_id, verification_code)
    VALUES (p_enrollment_id, v_course, p_user_id, upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)))
    ON CONFLICT (enrollment_id) DO NOTHING;
    SELECT verification_code INTO v_code FROM public.web_course_certificates WHERE enrollment_id = p_enrollment_id;
  END IF;
  RETURN jsonb_build_object('certificate_code', v_code);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_web_step(uuid, uuid, integer, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_web_step(uuid, uuid, integer, jsonb, jsonb) TO service_role;

-- ---------- Scheduler ----------
-- pg_cron calls /api/public/course-scheduler every 5 minutes. The request carries a random secret kept in
-- Supabase Vault (never a public API key); the route checks it through course_scheduler_secret_matches.
CREATE TABLE IF NOT EXISTS private.app_settings (key text PRIMARY KEY, value text NOT NULL);
REVOKE ALL ON private.app_settings FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'microlearn_course_scheduler_secret') THEN
    PERFORM vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'microlearn_course_scheduler_secret',
      'Authenticates pg_cron calls to /api/public/course-scheduler'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.course_scheduler_secret_matches(p_secret text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT coalesce(length(p_secret) >= 32 AND p_secret = (
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'microlearn_course_scheduler_secret' LIMIT 1
  ), false)
$$;
REVOKE ALL ON FUNCTION public.course_scheduler_secret_matches(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.course_scheduler_secret_matches(text) TO service_role;

-- Posts to the scheduler route once its URL is configured in private.app_settings ('course_scheduler_url').
CREATE OR REPLACE FUNCTION private.dispatch_course_scheduler()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  v_url text := (SELECT value FROM private.app_settings WHERE key = 'course_scheduler_url');
  v_secret text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'microlearn_course_scheduler_secret' LIMIT 1);
BEGIN
  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-course-scheduler-secret', v_secret),
    body := jsonb_build_object('scheduled_at', now()),
    timeout_milliseconds := 60000
  );
END;
$$;
REVOKE ALL ON FUNCTION private.dispatch_course_scheduler() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'course-scheduler-every-five-minutes';
SELECT cron.schedule('course-scheduler-every-five-minutes', '*/5 * * * *', 'SELECT private.dispatch_course_scheduler()');
