CREATE TABLE public.whatsapp_course_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  learner_name text NOT NULL,
  current_resource_id uuid REFERENCES public.course_resources(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused')),
  progress_percentage integer NOT NULL DEFAULT 0 CHECK (progress_percentage BETWEEN 0 AND 100),
  awaiting_reply boolean NOT NULL DEFAULT true,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, phone_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_course_enrollments TO authenticated;
GRANT ALL ON public.whatsapp_course_enrollments TO service_role;
ALTER TABLE public.whatsapp_course_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view WhatsApp enrollments" ON public.whatsapp_course_enrollments FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator'));
CREATE POLICY "Staff can create WhatsApp enrollments" ON public.whatsapp_course_enrollments FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator'));
CREATE POLICY "Staff can update WhatsApp enrollments" ON public.whatsapp_course_enrollments FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator')) WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator'));
CREATE POLICY "Admins can delete WhatsApp enrollments" ON public.whatsapp_course_enrollments FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));

CREATE TABLE public.course_quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL UNIQUE REFERENCES public.course_resources(id) ON DELETE CASCADE,
  question text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_answer text NOT NULL,
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_quiz_questions TO authenticated;
GRANT ALL ON public.course_quiz_questions TO service_role;
ALTER TABLE public.course_quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view course quizzes" ON public.course_quiz_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can create course quizzes" ON public.course_quiz_questions FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator'));
CREATE POLICY "Staff can update course quizzes" ON public.course_quiz_questions FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator')) WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator'));
CREATE POLICY "Staff can delete course quizzes" ON public.course_quiz_questions FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator'));

CREATE TABLE public.whatsapp_quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.whatsapp_course_enrollments(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.course_quiz_questions(id) ON DELETE CASCADE,
  submitted_answer text NOT NULL,
  is_correct boolean NOT NULL,
  attempt_number integer NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.whatsapp_quiz_attempts TO authenticated;
GRANT ALL ON public.whatsapp_quiz_attempts TO service_role;
ALTER TABLE public.whatsapp_quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view WhatsApp quiz attempts" ON public.whatsapp_quiz_attempts FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator'));
CREATE POLICY "Staff can record WhatsApp quiz attempts" ON public.whatsapp_quiz_attempts FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator'));

CREATE TABLE public.course_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL UNIQUE REFERENCES public.whatsapp_course_enrollments(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  learner_name text NOT NULL,
  phone_number text NOT NULL,
  verification_code text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.course_certificates TO authenticated;
GRANT ALL ON public.course_certificates TO service_role;
ALTER TABLE public.course_certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view course certificates" ON public.course_certificates FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator'));
CREATE POLICY "Staff can issue course certificates" ON public.course_certificates FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator'));

CREATE INDEX whatsapp_course_enrollments_phone_status_idx ON public.whatsapp_course_enrollments (phone_number, status);
CREATE INDEX whatsapp_course_enrollments_course_idx ON public.whatsapp_course_enrollments (course_id, created_at DESC);
CREATE INDEX whatsapp_quiz_attempts_enrollment_idx ON public.whatsapp_quiz_attempts (enrollment_id, created_at DESC);
CREATE INDEX course_certificates_course_idx ON public.course_certificates (course_id, issued_at DESC);

CREATE TRIGGER update_whatsapp_course_enrollments_updated_at BEFORE UPDATE ON public.whatsapp_course_enrollments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_course_quiz_questions_updated_at BEFORE UPDATE ON public.course_quiz_questions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_course_enrollments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_quiz_attempts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.course_certificates;