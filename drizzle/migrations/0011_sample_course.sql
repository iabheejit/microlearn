-- Sample course for demos and onboarding: three short days that teach how to learn on WhatsApp.
-- Re-runnable: fixed IDs, every insert skips rows that already exist. Nobody is enrolled by this
-- migration, so no learner is messaged until staff enrol a number.
DO $$
DECLARE
  v_owner uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.courses WHERE id = 'ecaa5000-0000-4000-8000-000000000001') THEN
    RETURN;
  END IF;
  -- Owned by whoever created the first course; a database with no courses has nobody to own it.
  SELECT created_by INTO v_owner FROM public.courses WHERE created_by IS NOT NULL ORDER BY created_at LIMIT 1;
  IF v_owner IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.courses (
    id, title, description, instructor, category, language, price, status, is_published, published_at, created_by,
    delivery_channel, pacing_mode, pacing_gap_days, pacing_unlock_time, pacing_timezone, pause_reminder_hours,
    whatsapp_welcome_template_key, whatsapp_completion_message,
    whatsapp_nudge_template_name, whatsapp_nudge_template_language
  ) VALUES (
    'ecaa5000-0000-4000-8000-000000000001',
    'Your First Week with MicroLearn',
    'Three short days that teach you how to learn on WhatsApp, and how to make it stick.',
    'Ekatra Learning Team', 'Onboarding', 'English', 0, 'published', true, now(), v_owner,
    'whatsapp', 'after_completion', 1, '09:00', 'Asia/Kolkata', 24,
    'course_welcome',
    E'🎓 Congratulations, {{name}}! You finished *{{course}}*.\n\nYou now know how to learn in minutes, one idea at a time.',
    'course_lesson_available', 'en_US'
  );

  INSERT INTO public.course_modules (id, course_id, title, description, order_index) VALUES
    ('ecaa5100-0000-4000-8000-000000000001', 'ecaa5000-0000-4000-8000-000000000001', 'Learn in minutes', 'Why short lessons work and how to steer them.', 1),
    ('ecaa5100-0000-4000-8000-000000000002', 'ecaa5000-0000-4000-8000-000000000001', 'Make it stick', 'Two habits that turn reading into remembering.', 2),
    ('ecaa5100-0000-4000-8000-000000000003', 'ecaa5000-0000-4000-8000-000000000001', 'Show what you know', 'Use one idea, then collect your certificate.', 3);

  INSERT INTO public.course_resources (id, module_id, title, content, resource_type, order_index) VALUES
    ('ecaa5200-0000-4000-8000-000000000001', 'ecaa5100-0000-4000-8000-000000000001', 'Why short lessons work',
     E'Your brain holds only a handful of ideas at once. A lesson that teaches *one* idea in about a minute gets remembered; a long one gets skimmed.\n\nThat is why every MicroLearn lesson is a few lines you can read between other things.', 'text', 1),
    ('ecaa5200-0000-4000-8000-000000000002', 'ecaa5100-0000-4000-8000-000000000001', 'You are in control',
     E'Tap *Next* to move on. Tap *Pause* any time: your place is saved and we will nudge you gently when you are ready.\n\nAfter each lesson there is one quick question. Do not worry about getting it wrong, because the answer teaches too.', 'text', 2),
    ('ecaa5200-0000-4000-8000-000000000003', 'ecaa5100-0000-4000-8000-000000000002', 'Recall beats re-reading',
     E'Trying to remember something strengthens it far more than reading it again.\n\nEach quiz question is a tiny act of recall. That is the point, not a test.', 'text', 1),
    ('ecaa5200-0000-4000-8000-000000000004', 'ecaa5100-0000-4000-8000-000000000002', 'Space it out',
     E'Reviewing something a day later beats cramming it all at once.\n\nThat is why MicroLearn gives you one short day at a time. Come back tomorrow and it sticks.', 'text', 2),
    ('ecaa5200-0000-4000-8000-000000000005', 'ecaa5100-0000-4000-8000-000000000003', 'Use one idea today',
     E'Pick one thing from this week and use it today: explain one idea to a friend, or recall Day 1 without scrolling up.\n\nUsing an idea is how learning becomes yours.', 'text', 1),
    ('ecaa5200-0000-4000-8000-000000000006', 'ecaa5100-0000-4000-8000-000000000003', 'Your certificate',
     E'When you finish, your certificate arrives right here as a PDF, with a link anyone can open to verify it.\n\nTap *Next* for your last question.', 'text', 2);

  INSERT INTO public.course_quiz_questions (id, resource_id, question, options, correct_answer, explanation) VALUES
    ('ecaa5300-0000-4000-8000-000000000001', 'ecaa5200-0000-4000-8000-000000000001', 'How many ideas should one micro-lesson teach?',
     '["One","Five","As many as fit"]', 'One', 'One idea per lesson keeps it light enough to remember.'),
    ('ecaa5300-0000-4000-8000-000000000002', 'ecaa5200-0000-4000-8000-000000000002', 'What happens when you tap Pause?',
     '["Progress is lost","Your place is saved","The course ends"]', 'Your place is saved', 'Pause keeps your place so you can pick up later.'),
    ('ecaa5300-0000-4000-8000-000000000003', 'ecaa5200-0000-4000-8000-000000000003', 'Which helps memory most?',
     '["Re-reading","Recalling it","Highlighting"]', 'Recalling it', 'Pulling an idea back from memory is what makes it stick.'),
    ('ecaa5300-0000-4000-8000-000000000004', 'ecaa5200-0000-4000-8000-000000000004', 'Why do you get one day at a time?',
     '["Spacing helps memory","To slow you down","No reason"]', 'Spacing helps memory', 'Spacing out review beats cramming.'),
    ('ecaa5300-0000-4000-8000-000000000005', 'ecaa5200-0000-4000-8000-000000000005', 'What turns learning into something you keep?',
     '["Using it","Forgetting it","Scrolling past"]', 'Using it', 'Applying an idea is how it becomes yours.'),
    ('ecaa5300-0000-4000-8000-000000000006', 'ecaa5200-0000-4000-8000-000000000006', 'How can someone verify your certificate?',
     '["Open its link","They cannot","Ask Ekatra by phone"]', 'Open its link', 'Every certificate has a public verify page.');
END;
$$;
