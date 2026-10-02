import { createServiceClient } from './auth.ts';
import { sendWhatsAppText } from './whatsapp.ts';

const client = createServiceClient();

export async function orderedLessons(courseId: string) {
  const { data: modules, error: moduleError } = await client.from('course_modules')
    .select('id').eq('course_id', courseId).order('order_index');
  if (moduleError) throw moduleError;
  if (!modules?.length) return [];
  const { data: resources, error: resourceError } = await client.from('course_resources')
    .select('id,module_id,title,content,resource_type,order_index').in('module_id', modules.map((module) => module.id)).order('order_index');
  if (resourceError) throw resourceError;
  return modules.flatMap((module) => (resources || []).filter((resource) => resource.module_id === module.id));
}

async function lessonText(resource: { id: string; title: string; content: string }, position: number, total: number) {
  const { data: quiz, error } = await client.from('course_quiz_questions')
    .select('question,options').eq('resource_id', resource.id).maybeSingle();
  if (error) throw error;
  const options = Array.isArray(quiz?.options) ? quiz.options : [];
  const choices = options.map((option, index) => typeof option === 'string' ? `${index + 1}. ${option}` : '').filter(Boolean).join('\n');
  return [`Lesson ${position + 1}/${total}: ${resource.title}`, resource.content,
    quiz ? `${quiz.question}${choices ? `\n${choices}` : ''}\nReply with your answer.` : 'Reply NEXT when you are ready for the next lesson.'].join('\n\n').slice(0, 4096);
}

export async function progressFromReply(phoneNumber: string, text: string, providerMessageId: string) {
  const { data: enrollments, error: enrollmentError } = await client.from('whatsapp_course_enrollments')
    .select('*').eq('phone_number', phoneNumber).eq('status', 'active').eq('awaiting_reply', true).order('updated_at', { ascending: false }).limit(2);
  if (enrollmentError) throw enrollmentError;
  // A phone enrolled in two active courses cannot be advanced unambiguously.
  if (!enrollments?.length || enrollments.length > 1) return;
  const enrollment = enrollments[0];
  const resources = await orderedLessons(enrollment.course_id);
  if (!resources.length) return;
  const { data: processed, error: processedError } = await client.from('whatsapp_progression_events')
    .insert({ enrollment_id: enrollment.id, provider_message_id: providerMessageId }).select('id').maybeSingle();
  if (processedError) {
    if (processedError.code === '23505') return;
    throw processedError;
  }
  if (!processed) return;
  try {
  const currentIndex = resources.findIndex((resource) => resource.id === enrollment.current_resource_id);
  if (enrollment.current_resource_id && currentIndex < 0) throw new Error('Current lesson is no longer in this course');

  if (currentIndex >= 0) {
    const { data: quiz, error: quizError } = await client.from('course_quiz_questions')
      .select('id,correct_answer,explanation,options').eq('resource_id', resources[currentIndex].id).maybeSingle();
    if (quizError) throw quizError;
    if (quiz) {
      const options = Array.isArray(quiz.options) ? quiz.options : [];
      const answer = text.trim().toLowerCase();
      const chosen = /^\d+$/.test(answer) ? options[Number(answer) - 1] : undefined;
      const normalized = typeof chosen === 'string' ? chosen.trim().toLowerCase() : answer;
      const correct = normalized === quiz.correct_answer.trim().toLowerCase();
      const { count, error: countError } = await client.from('whatsapp_quiz_attempts')
        .select('id', { count: 'exact', head: true }).eq('enrollment_id', enrollment.id).eq('question_id', quiz.id);
      if (countError) throw countError;
      const { error: attemptError } = await client.from('whatsapp_quiz_attempts').insert({
        enrollment_id: enrollment.id, question_id: quiz.id, submitted_answer: text.trim().slice(0, 4096),
        is_correct: correct, attempt_number: (count || 0) + 1,
      });
      if (attemptError) throw attemptError;
      if (!correct) {
        await sendWhatsAppText(phoneNumber, `Not quite. ${quiz.explanation || 'Please try again.'}\nReply with your answer to continue.`);
        return;
      }
    } else if (!/^(next|done|continue)$/i.test(text.trim())) {
      await sendWhatsAppText(phoneNumber, 'Reply NEXT when you are ready for the next lesson.');
      return;
    }
  }

  const next = resources[currentIndex + 1];
  if (next) {
    await sendWhatsAppText(phoneNumber, await lessonText(next, currentIndex + 1, resources.length));
    const { error } = await client.from('whatsapp_course_enrollments').update({
      current_resource_id: next.id, progress_percentage: Math.round(((currentIndex + 1) / resources.length) * 100),
    }).eq('id', enrollment.id);
    if (error) throw error;
    return;
  }

  const code = crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase();
  const { data: certificate, error: certificateError } = await client.from('course_certificates').upsert({
    enrollment_id: enrollment.id, course_id: enrollment.course_id, learner_name: enrollment.learner_name,
    phone_number: phoneNumber, verification_code: code,
  }, { onConflict: 'enrollment_id', ignoreDuplicates: true }).select('verification_code').maybeSingle();
  if (certificateError) throw certificateError;
  const { data: existing, error: lookupError } = certificate ? { data: certificate, error: null } : await client.from('course_certificates')
    .select('verification_code').eq('enrollment_id', enrollment.id).single();
  if (lookupError) throw lookupError;
  await sendWhatsAppText(phoneNumber, `Congratulations, ${enrollment.learner_name}! You completed the course. Certificate verification code: ${existing?.verification_code}`);
  const { error: completeError } = await client.from('whatsapp_course_enrollments').update({
    status: 'completed', progress_percentage: 100, awaiting_reply: false, completed_at: new Date().toISOString(),
  }).eq('id', enrollment.id);
  if (completeError) throw completeError;
  } catch (error) {
    await client.from('whatsapp_progression_events').delete().eq('id', processed.id);
    throw error;
  }
}