-- Each course is delivered on exactly one channel; web courses are invite-only or open for self-enrollment.
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS delivery_channel text NOT NULL DEFAULT 'whatsapp' CHECK (delivery_channel IN ('whatsapp', 'telegram', 'web')),
  ADD COLUMN IF NOT EXISTS web_enrollment_mode text NOT NULL DEFAULT 'invite' CHECK (web_enrollment_mode IN ('invite', 'open'));

-- Web enrollments belong to a signed-in learner. All writes go through trusted server code.
CREATE TABLE public.web_course_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused')),
  -- NULL means the learner has not finished any lesson yet and is on the first one.
  current_resource_id uuid REFERENCES public.course_resources(id) ON DELETE SET NULL,
  progress_percentage integer NOT NULL DEFAULT 0 CHECK (progress_percentage BETWEEN 0 AND 100),
  enrolled_via text NOT NULL CHECK (enrolled_via IN ('invite', 'self')),
  enrolled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, user_id)
);
REVOKE ALL ON public.web_course_enrollments FROM anon;
GRANT SELECT ON public.web_course_enrollments TO authenticated;
GRANT ALL ON public.web_course_enrollments TO service_role;
ALTER TABLE public.web_course_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Learners view own web enrollments; active staff view all" ON public.web_course_enrollments FOR SELECT TO authenticated
USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator'));
CREATE INDEX web_course_enrollments_user_idx ON public.web_course_enrollments (user_id, updated_at DESC);
CREATE INDEX web_course_enrollments_course_idx ON public.web_course_enrollments (course_id, created_at DESC);
CREATE TRIGGER update_web_course_enrollments_updated_at BEFORE UPDATE ON public.web_course_enrollments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.web_quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.web_course_enrollments(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.course_quiz_questions(id) ON DELETE CASCADE,
  submitted_answer text NOT NULL,
  is_correct boolean NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.web_quiz_attempts FROM anon;
GRANT SELECT ON public.web_quiz_attempts TO authenticated;
GRANT ALL ON public.web_quiz_attempts TO service_role;
ALTER TABLE public.web_quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Learners view own web quiz attempts; active staff view all" ON public.web_quiz_attempts FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.web_course_enrollments e WHERE e.id = web_quiz_attempts.enrollment_id AND e.user_id = auth.uid())
  OR private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator')
);
CREATE INDEX web_quiz_attempts_enrollment_idx ON public.web_quiz_attempts (enrollment_id, created_at DESC);

CREATE TABLE public.web_course_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL UNIQUE REFERENCES public.web_course_enrollments(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  verification_code text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.web_course_certificates FROM anon;
GRANT SELECT ON public.web_course_certificates TO authenticated;
GRANT ALL ON public.web_course_certificates TO service_role;
ALTER TABLE public.web_course_certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Learners view own web certificates; active staff view all" ON public.web_course_certificates FOR SELECT TO authenticated
USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator'));

-- Applies one web learning step atomically. The row lock serialises double-clicks and parallel tabs;
-- a stale expected lesson raises so the caller can reload instead of skipping a lesson.
CREATE OR REPLACE FUNCTION public.apply_web_progression(
  p_enrollment_id uuid,
  p_user_id uuid,
  p_expected_resource_id uuid,
  p_question_id uuid,
  p_submitted_answer text,
  p_is_correct boolean,
  p_advance boolean,
  p_next_resource_id uuid,
  p_progress integer,
  p_complete boolean
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_current uuid;
  v_course uuid;
  v_code text;
BEGIN
  SELECT current_resource_id, course_id INTO v_current, v_course FROM public.web_course_enrollments
  WHERE id = p_enrollment_id AND user_id = p_user_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND OR v_current IS DISTINCT FROM p_expected_resource_id THEN
    RAISE EXCEPTION 'progression_conflict' USING ERRCODE = '40001';
  END IF;

  IF p_question_id IS NOT NULL THEN
    INSERT INTO public.web_quiz_attempts (enrollment_id, question_id, submitted_answer, is_correct, attempt_number)
    SELECT p_enrollment_id, p_question_id, p_submitted_answer, p_is_correct, COALESCE(MAX(attempt_number), 0) + 1
    FROM public.web_quiz_attempts WHERE enrollment_id = p_enrollment_id AND question_id = p_question_id;
  END IF;

  IF p_complete THEN
    UPDATE public.web_course_enrollments
    SET status = 'completed', progress_percentage = 100, completed_at = now()
    WHERE id = p_enrollment_id;
    INSERT INTO public.web_course_certificates (enrollment_id, course_id, user_id, verification_code)
    VALUES (p_enrollment_id, v_course, p_user_id, upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)))
    ON CONFLICT (enrollment_id) DO NOTHING;
    SELECT verification_code INTO v_code FROM public.web_course_certificates WHERE enrollment_id = p_enrollment_id;
  ELSIF p_advance THEN
    UPDATE public.web_course_enrollments
    SET current_resource_id = p_next_resource_id, progress_percentage = p_progress
    WHERE id = p_enrollment_id;
  END IF;

  RETURN jsonb_build_object('completed', p_complete, 'certificate_code', v_code);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_web_progression(uuid, uuid, uuid, uuid, text, boolean, boolean, uuid, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_web_progression(uuid, uuid, uuid, uuid, text, boolean, boolean, uuid, integer, boolean) TO service_role;

-- Lets trusted server code resolve an invite email to an account without exposing auth.users.
CREATE OR REPLACE FUNCTION public.find_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(trim(p_email)) LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.find_auth_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_auth_user_id_by_email(text) TO service_role;
