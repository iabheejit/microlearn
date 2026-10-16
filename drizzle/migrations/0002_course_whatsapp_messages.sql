ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS whatsapp_welcome_template_key text NOT NULL DEFAULT 'course_welcome',
  ADD COLUMN IF NOT EXISTS whatsapp_lesson_intro text,
  ADD COLUMN IF NOT EXISTS whatsapp_completion_message text;
ALTER TABLE public.whatsapp_course_enrollments
  ADD COLUMN IF NOT EXISTS welcome_template_name text,
  ADD COLUMN IF NOT EXISTS welcome_message_id text;