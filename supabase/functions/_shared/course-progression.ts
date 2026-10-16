import { createServiceClient } from './auth.ts';
import { sendWhatsAppText } from './whatsapp.ts';
import { gradeQuizAnswer, isContinueReply } from './whatsapp-logic.ts';

export type ProgressionOutcome =
  | 'no_enrollment' | 'ambiguous_enrollment' | 'no_lessons' | 'duplicate' | 'resent'
  | 'wrong_answer' | 'awaiting_next' | 'advanced' | 'completed';

export async function orderedLessons(courseId: string) {
  const client = createServiceClient();
  const { data: modules, error: moduleError } = await client.from('course_modules')
    .select('id').eq('course_id', courseId).order('order_index');
  if (moduleError) throw moduleError;
  if (!modules?.length) return [];
  const { data: resources, error: resourceError } = await client.from('course_resources')
    .select('id,module_id,title,content,resource_type,order_index').in('module_id', modules.map((module) => module.id)).order('order_index');
  if (resourceError) throw resourceError;
  return modules.flatMap((module) => (resources || []).filter((resource) => resource.module_id === module.id));
}

async function lessonText(resource: { id: string; title: string; content: string }, position: number, total: number, intro?: string | null) {
  const client = createServiceClient();
  const { data: quiz, error } = await client.from('course_quiz_questions')
    .select('question,options').eq('resource_id', resource.id).maybeSingle();
  if (error) throw error;
  const options = Array.isArray(quiz?.options) ? quiz.options : [];
  const choices = options.map((option, index) => typeof option === 'string' ? `${index + 1}. ${option}` : '').filter(Boolean).join('\n');
  return [...(intro?.trim() ? [intro.trim()] : []), `Lesson ${position + 1}/${total}: ${resource.title}`, resource.content,
    quiz ? `${quiz.question}${choices ? `\n${choices}` : ''}\nReply with your answer.` : 'Reply NEXT when you are ready for the next lesson.'].join('\n\n').slice(0, 4096);
}

async function deliver(eventId: string, phoneNumber: string, responseText: string) {
  const client = createServiceClient();
  await sendWhatsAppText(phoneNumber, responseText);
  const { error } = await client.from('whatsapp_progression_events')
    .update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', eventId);
  if (error) throw error;
}

// Each learner message is processed once: the decision and its reply are committed atomically
// (apply_whatsapp_progression) before sending, so a retry re-sends the stored reply only.
export async function progressFromReply(phoneNumber: string, text: string, providerMessageId: string): Promise<ProgressionOutcome> {
  const client = createServiceClient();
  const { data: existing, error: existingError } = await client.from('whatsapp_progression_events')
    .select('id,status,response_text').eq('provider_message_id', providerMessageId).maybeSingle();
  if (existingError) throw existingError;
  if (existing?.status === 'completed') return 'duplicate';
  if (existing?.response_text) {
    await deliver(existing.id, phoneNumber, existing.response_text);
    return 'resent';
  }
  if (existing) {
    // A previous attempt stopped before committing a decision; start over.
    const { error } = await client.from('whatsapp_progression_events').delete().eq('id', existing.id).eq('status', 'pending').is('response_text', null);
    if (error) throw error;
  }

  const { data: enrollments, error: enrollmentError } = await client.from('whatsapp_course_enrollments')
    .select('*').eq('phone_number', phoneNumber).eq('status', 'active').eq('awaiting_reply', true).order('updated_at', { ascending: false }).limit(2);
  if (enrollmentError) throw enrollmentError;
  if (!enrollments?.length) return 'no_enrollment';
  // A phone with more than one active enrollment awaiting a reply cannot be advanced unambiguously.
  if (enrollments.length > 1) return 'ambiguous_enrollment';
  const enrollment = enrollments[0];
  const resources = await orderedLessons(enrollment.course_id);
  if (!resources.length) return 'no_lessons';
  const { data: courseSettings, error: courseError } = await client.from('courses')
    .select('title,whatsapp_lesson_intro,whatsapp_completion_message').eq('id', enrollment.course_id).single();
  if (courseError) throw courseError;

  const { data: event, error: eventError } = await client.from('whatsapp_progression_events')
    .insert({ enrollment_id: enrollment.id, provider_message_id: providerMessageId, status: 'pending' }).select('id').single();
  if (eventError) {
    if (eventError.code === '23505') return 'duplicate';
    throw eventError;
  }

  let outcome: ProgressionOutcome;
  let responseText: string;
  try {
    const currentIndex = resources.findIndex((resource) => resource.id === enrollment.current_resource_id);
    if (enrollment.current_resource_id && currentIndex < 0) throw new Error('Current lesson is no longer in this course');

    let quizAttempt: { id: string; correct: boolean; explanation: string | null } | null = null;
    let advance = true;
    if (currentIndex >= 0) {
      const { data: quiz, error: quizError } = await client.from('course_quiz_questions')
        .select('id,correct_answer,explanation,options').eq('resource_id', resources[currentIndex].id).maybeSingle();
      if (quizError) throw quizError;
      if (quiz) {
        const correct = gradeQuizAnswer(text, Array.isArray(quiz.options) ? quiz.options : [], quiz.correct_answer);
        quizAttempt = { id: quiz.id, correct, explanation: quiz.explanation };
        advance = correct;
      } else {
        advance = isContinueReply(text);
      }
    }

    const next = resources[currentIndex + 1];
    let complete = false;
    if (!advance) {
      outcome = quizAttempt ? 'wrong_answer' : 'awaiting_next';
      responseText = quizAttempt
        ? `Not quite. ${quizAttempt.explanation || 'Please try again.'}\nReply with your answer to continue.`
        : 'Reply NEXT when you are ready for the next lesson.';
    } else if (next) {
      outcome = 'advanced';
      responseText = await lessonText(next, currentIndex + 1, resources.length, courseSettings.whatsapp_lesson_intro);
    } else {
      outcome = 'completed';
      complete = true;
      const code = crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase();
      const { error: certificateError } = await client.from('course_certificates').upsert({
        enrollment_id: enrollment.id, course_id: enrollment.course_id, learner_name: enrollment.learner_name,
        phone_number: phoneNumber, verification_code: code,
      }, { onConflict: 'enrollment_id', ignoreDuplicates: true });
      if (certificateError) throw certificateError;
      const { data: certificate, error: lookupError } = await client.from('course_certificates')
        .select('verification_code').eq('enrollment_id', enrollment.id).single();
      if (lookupError) throw lookupError;
      const verification = certificate.verification_code;
      const custom = courseSettings.whatsapp_completion_message?.trim();
      const completion = custom
        ? custom.replaceAll('{{name}}', enrollment.learner_name).replaceAll('{{course}}', courseSettings.title).replaceAll('{{code}}', verification)
        : `Congratulations, ${enrollment.learner_name}! You completed ${courseSettings.title}.`;
      // The certificate code is always included, even when a custom message omits {{code}}.
      responseText = completion.includes(verification) ? completion : `${completion}\nCertificate verification code: ${verification}`;
    }

    const { error: applyError } = await client.rpc('apply_whatsapp_progression', {
      p_event_id: event.id,
      p_enrollment_id: enrollment.id,
      p_expected_resource_id: enrollment.current_resource_id,
      p_next_resource_id: advance && next ? next.id : null,
      p_progress: Math.round(((currentIndex + 1) / resources.length) * 100),
      p_advance: advance && Boolean(next),
      p_complete: complete,
      p_question_id: quizAttempt?.id ?? null,
      p_submitted_answer: quizAttempt ? text.trim().slice(0, 4096) : null,
      p_is_correct: quizAttempt?.correct ?? null,
      p_outcome: outcome,
      p_response_text: responseText,
    });
    if (applyError) throw applyError;
  } catch (error) {
    // Nothing was committed, so drop the claim and let the callback retry recompute.
    await client.from('whatsapp_progression_events').delete().eq('id', event.id).is('response_text', null);
    throw error;
  }

  // The decision is committed; a send failure leaves the event pending for the retry to re-send.
  await deliver(event.id, phoneNumber, responseText);
  return outcome;
}
