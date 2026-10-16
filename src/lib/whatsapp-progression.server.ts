import type { SupabaseClient } from "@supabase/supabase-js";
import { gradeQuizAnswer, isContinueReply } from "../../supabase/functions/_shared/whatsapp-logic.ts";
import { sendAutomatedWhatsAppText } from "./whatsapp-send.server";

// Port of supabase/functions/_shared/course-progression.ts for the TanStack callback route.
// Each learner message is decided once (apply_whatsapp_progression) before sending; retries re-send the stored reply.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any>;

async function orderedLessons(client: Client, courseId: string) {
  const { data: modules, error } = await client.from("course_modules").select("id").eq("course_id", courseId).order("order_index");
  if (error) throw error;
  if (!modules?.length) return [];
  const { data: resources, error: rError } = await client.from("course_resources")
    .select("id,module_id,title,content,order_index").in("module_id", modules.map((m) => m.id)).order("order_index");
  if (rError) throw rError;
  return modules.flatMap((m) => (resources ?? []).filter((r) => r.module_id === m.id)) as { id: string; title: string; content: string }[];
}

async function lessonText(client: Client, resource: { id: string; title: string; content: string }, position: number, total: number, intro?: string | null) {
  const { data: quiz, error } = await client.from("course_quiz_questions").select("question,options").eq("resource_id", resource.id).maybeSingle();
  if (error) throw error;
  const options = Array.isArray(quiz?.options) ? quiz.options : [];
  const choices = options.map((o: unknown, i: number) => (typeof o === "string" ? `${i + 1}. ${o}` : "")).filter(Boolean).join("\n");
  return [...(intro?.trim() ? [intro.trim()] : []), `Lesson ${position + 1}/${total}: ${resource.title}`, resource.content,
    quiz ? `${quiz.question}${choices ? `\n${choices}` : ""}\nReply with your answer.` : "Reply NEXT when you are ready for the next lesson."]
    .join("\n\n").slice(0, 4096);
}

async function deliver(client: Client, eventId: string, phone: string, text: string) {
  await sendAutomatedWhatsAppText(phone, text);
  const { error } = await client.from("whatsapp_progression_events").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", eventId);
  if (error) throw error;
}

export async function progressFromReply(client: Client, phone: string, text: string, providerMessageId: string) {
  const { data: existing, error: existingError } = await client.from("whatsapp_progression_events")
    .select("id,status,response_text").eq("provider_message_id", providerMessageId).maybeSingle();
  if (existingError) throw existingError;
  if (existing?.status === "completed") return "duplicate";
  if (existing?.response_text) { await deliver(client, existing.id, phone, existing.response_text); return "resent"; }
  if (existing) {
    const { error } = await client.from("whatsapp_progression_events").delete().eq("id", existing.id).eq("status", "pending").is("response_text", null);
    if (error) throw error;
  }

  const { data: enrollments, error: eError } = await client.from("whatsapp_course_enrollments")
    .select("*").eq("phone_number", phone).eq("status", "active").eq("awaiting_reply", true).order("updated_at", { ascending: false }).limit(2);
  if (eError) throw eError;
  if (!enrollments?.length) return "no_enrollment";
  if (enrollments.length > 1) return "ambiguous_enrollment";
  const enrollment = enrollments[0];
  const resources = await orderedLessons(client, enrollment.course_id);
  if (!resources.length) return "no_lessons";
  const { data: course, error: cError } = await client.from("courses")
    .select("title,whatsapp_lesson_intro,whatsapp_completion_message").eq("id", enrollment.course_id).single();
  if (cError) throw cError;

  const { data: event, error: evError } = await client.from("whatsapp_progression_events")
    .insert({ enrollment_id: enrollment.id, provider_message_id: providerMessageId, status: "pending" }).select("id").single();
  if (evError) { if (evError.code === "23505") return "duplicate"; throw evError; }

  let outcome: string;
  let responseText: string;
  try {
    const currentIndex = resources.findIndex((r) => r.id === enrollment.current_resource_id);
    if (enrollment.current_resource_id && currentIndex < 0) throw new Error("Current lesson is no longer in this course");
    let quizAttempt: { id: string; correct: boolean; explanation: string | null } | null = null;
    let advance = true;
    if (currentIndex >= 0) {
      const { data: quiz, error: qError } = await client.from("course_quiz_questions")
        .select("id,correct_answer,explanation,options").eq("resource_id", resources[currentIndex].id).maybeSingle();
      if (qError) throw qError;
      if (quiz) {
        const correct = gradeQuizAnswer(text, Array.isArray(quiz.options) ? quiz.options : [], quiz.correct_answer);
        quizAttempt = { id: quiz.id, correct, explanation: quiz.explanation };
        advance = correct;
      } else advance = isContinueReply(text);
    }
    const next = resources[currentIndex + 1];
    let complete = false;
    if (!advance) {
      outcome = quizAttempt ? "wrong_answer" : "awaiting_next";
      responseText = quizAttempt ? `Not quite. ${quizAttempt.explanation || "Please try again."}\nReply with your answer to continue.` : "Reply NEXT when you are ready for the next lesson.";
    } else if (next) {
      outcome = "advanced";
      const lesson = await lessonText(client, next, currentIndex + 1, resources.length, course.whatsapp_lesson_intro);
      responseText = quizAttempt ? `Correct! ${quizAttempt.explanation ?? ""}`.trim() + "\n\n" + lesson : lesson;
    } else {
      outcome = "completed";
      complete = true;
      const code = crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase();
      const { error: certError } = await client.from("course_certificates").upsert({ enrollment_id: enrollment.id, course_id: enrollment.course_id, learner_name: enrollment.learner_name, phone_number: phone, verification_code: code }, { onConflict: "enrollment_id", ignoreDuplicates: true });
      if (certError) throw certError;
      const { data: cert, error: lError } = await client.from("course_certificates").select("verification_code").eq("enrollment_id", enrollment.id).single();
      if (lError) throw lError;
      const v = cert.verification_code as string;
      const custom = (course.whatsapp_completion_message as string | null)?.trim();
      const msg = custom ? custom.replaceAll("{{name}}", enrollment.learner_name).replaceAll("{{course}}", course.title).replaceAll("{{code}}", v) : `Congratulations, ${enrollment.learner_name}! You completed ${course.title}.`;
      responseText = msg.includes(v) ? msg : `${msg}\nCertificate verification code: ${v}`;
    }
    const { error: applyError } = await client.rpc("apply_whatsapp_progression", {
      p_event_id: event.id, p_enrollment_id: enrollment.id, p_expected_resource_id: enrollment.current_resource_id,
      p_next_resource_id: advance && next ? next.id : null, p_progress: Math.round(((currentIndex + 1) / resources.length) * 100),
      p_advance: advance && Boolean(next), p_complete: complete, p_question_id: quizAttempt?.id ?? null,
      p_submitted_answer: quizAttempt ? text.trim().slice(0, 4096) : null, p_is_correct: quizAttempt?.correct ?? null,
      p_outcome: outcome, p_response_text: responseText,
    });
    if (applyError) throw applyError;
  } catch (error) {
    await client.from("whatsapp_progression_events").delete().eq("id", event.id).is("response_text", null);
    throw error;
  }
  await deliver(client, event.id, phone, responseText);
  return outcome;
}
