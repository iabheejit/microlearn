import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decideStep,
  type Decision,
  type EnrollmentState,
  type Input,
} from "./course-engine";
import { loadCourse, quizFor, type CourseContext } from "./course-data.server";
import {
  interpretReply,
  renderOutputs,
  type InboundReply,
  type OutgoingMessage,
} from "./whatsapp-course-messages";
import { sendAutomatedWhatsApp } from "./whatsapp-send.server";

// WhatsApp course progression on top of the channel-neutral engine (course-engine.ts).
// Every step is committed with its outgoing messages (apply_whatsapp_step) before anything is sent;
// delivery then resumes from delivered_count, so retries never skip or repeat a step.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any>;
export { loadCourse, quizFor, type CourseContext };
export type Send = (
  phone: string,
  payload: Record<string, unknown>,
  content: string,
) => Promise<string>;

export type EnrollmentRow = {
  id: string;
  course_id: string;
  phone_number: string;
  learner_name: string;
  status: EnrollmentState["status"];
  current_resource_id: string | null;
  current_step: EnrollmentState["step"];
  progress_percentage: number;
  paused_at: string | null;
  pause_reminder_sent_at: string | null;
  next_unlock_at: string | null;
  nudge_sent_at: string | null;
  completed_at: string | null;
  state_version: number;
};

export const stateOf = (row: EnrollmentRow): EnrollmentState => ({
  status: row.status,
  currentResourceId: row.current_resource_id,
  step: row.current_step ?? "lesson",
  progress: row.progress_percentage ?? 0,
  pausedAt: row.paused_at,
  pauseReminderSentAt: row.pause_reminder_sent_at,
  nextUnlockAt: row.next_unlock_at,
  nudgeSentAt: row.nudge_sent_at,
  completedAt: row.completed_at,
});

export const stateColumns = (state: EnrollmentState) => ({
  status: state.status,
  current_resource_id: state.currentResourceId,
  current_step: state.step,
  progress_percentage: state.progress,
  paused_at: state.pausedAt,
  pause_reminder_sent_at: state.pauseReminderSentAt,
  next_unlock_at: state.nextUnlockAt,
  nudge_sent_at: state.nudgeSentAt,
  completed_at: state.completedAt,
});

/** Sends an event's stored messages in order, resuming after the last one WhatsApp accepted. */
export async function deliverEvent(
  client: Client,
  event: {
    id: string;
    response_messages: OutgoingMessage[] | null;
    delivered_count: number;
  },
  phone: string,
  send: Send,
) {
  const messages = event.response_messages ?? [];
  for (
    let index = event.delivered_count ?? 0;
    index < messages.length;
    index++
  ) {
    await send(phone, messages[index].payload, messages[index].content);
    const { error } = await client
      .from("whatsapp_progression_events")
      .update({ delivered_count: index + 1 })
      .eq("id", event.id);
    if (error) throw error;
  }
  const { error } = await client
    .from("whatsapp_progression_events")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", event.id);
  if (error) throw error;
}

async function certificateText(
  client: Client,
  enrollment: EnrollmentRow,
  course: CourseContext,
) {
  const code = crypto
    .randomUUID()
    .replaceAll("-", "")
    .slice(0, 16)
    .toUpperCase();
  const { error } = await client.from("course_certificates").upsert(
    {
      enrollment_id: enrollment.id,
      course_id: course.id,
      learner_name: enrollment.learner_name,
      phone_number: enrollment.phone_number,
      verification_code: code,
    },
    { onConflict: "enrollment_id", ignoreDuplicates: true },
  );
  if (error) throw error;
  const { data, error: lookupError } = await client
    .from("course_certificates")
    .select("verification_code")
    .eq("enrollment_id", enrollment.id)
    .single();
  if (lookupError) throw lookupError;
  const verification = data.verification_code as string;
  const custom = course.completionMessage?.trim();
  const message = custom
    ? custom
        .replaceAll("{{name}}", enrollment.learner_name)
        .replaceAll("{{course}}", course.title)
        .replaceAll("{{code}}", verification)
    : `🎓 Congratulations, ${enrollment.learner_name}! You completed ${course.title}.`;
  // The certificate code is always included, even when a custom message omits {{code}}.
  return message.includes(verification)
    ? message
    : `${message}\nCertificate verification code: ${verification}`;
}

/** Messages for a decision; issues the certificate first when the course is completed. */
export async function messagesFor(
  client: Client,
  decision: Decision,
  enrollment: EnrollmentRow,
  course: CourseContext,
) {
  const completionText =
    decision.outcome === "completed"
      ? await certificateText(client, enrollment, course)
      : "";
  return renderOutputs(decision.outputs, {
    courseTitle: course.title,
    learnerName: enrollment.learner_name,
    lessonIntro: course.lessonIntro,
    timezone: course.pacing.timezone,
    completionText,
  });
}

/**
 * Claims `key` (a provider message ID or a scheduler key), commits the new state with its messages,
 * then delivers them. Returns false when another worker already claimed the key.
 */
export async function applyAndDeliver(
  client: Client,
  args: {
    key: string;
    enrollment: EnrollmentRow;
    state: EnrollmentState;
    attempt: Decision["attempt"];
    outcome: string;
    messages: OutgoingMessage[];
    send: Send;
  },
) {
  const { data: event, error: eventError } = await client
    .from("whatsapp_progression_events")
    .insert({
      enrollment_id: args.enrollment.id,
      provider_message_id: args.key,
      status: "pending",
    })
    .select("id")
    .single();
  if (eventError) {
    if (eventError.code === "23505") return false;
    throw eventError;
  }
  const { error: applyError } = await client.rpc("apply_whatsapp_step", {
    p_event_id: event.id,
    p_enrollment_id: args.enrollment.id,
    p_expected_version: args.enrollment.state_version ?? 0,
    p_state: stateColumns(args.state),
    p_attempt: args.attempt
      ? {
          question_id: args.attempt.questionId,
          answer: args.attempt.answer,
          correct: args.attempt.correct,
        }
      : null,
    p_outcome: args.outcome,
    p_messages: args.messages,
  });
  if (applyError) {
    // Nothing was committed: drop the claim so a retry decides again against the current state.
    await client
      .from("whatsapp_progression_events")
      .delete()
      .eq("id", event.id)
      .is("response_messages", null);
    throw applyError;
  }
  await deliverEvent(
    client,
    { id: event.id, response_messages: args.messages, delivered_count: 0 },
    args.enrollment.phone_number,
    args.send,
  );
  return true;
}

export type ReplyOptions = { send?: Send; now?: Date };

export async function progressFromReply(
  client: Client,
  phone: string,
  reply: InboundReply | string,
  providerMessageId: string,
  options: ReplyOptions = {},
) {
  const send = options.send ?? sendAutomatedWhatsApp;
  const now = options.now ?? new Date();
  const { data: existing, error: existingError } = await client
    .from("whatsapp_progression_events")
    .select("id,status,response_messages,delivered_count")
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.status === "completed") return "duplicate";
  if (existing?.response_messages) {
    await deliverEvent(client, existing, phone, send);
    return "resent";
  }
  if (existing) {
    const { error } = await client
      .from("whatsapp_progression_events")
      .delete()
      .eq("id", existing.id)
      .eq("status", "pending")
      .is("response_messages", null);
    if (error) throw error;
  }

  const { data: enrollments, error: enrollmentError } = await client
    .from("whatsapp_course_enrollments")
    .select("*")
    .eq("phone_number", phone)
    .eq("status", "active")
    .eq("awaiting_reply", true)
    .order("updated_at", { ascending: false })
    .limit(2);
  if (enrollmentError) throw enrollmentError;
  if (!enrollments?.length) return "no_enrollment";
  // A phone with more than one active enrollment awaiting a reply cannot be advanced unambiguously.
  if (enrollments.length > 1) return "ambiguous_enrollment";
  const enrollment = enrollments[0] as EnrollmentRow;
  const course = await loadCourse(client, enrollment.course_id);
  if (!course.lessons.length) return "no_lessons";

  const input: Input = interpretReply(
    typeof reply === "string" ? { text: reply } : reply,
  );
  const decision = decideStep({
    state: stateOf(enrollment),
    lessons: course.lessons,
    quiz: await quizFor(client, enrollment.current_resource_id),
    pacing: course.pacing,
    input,
    now,
  });
  if (!decision.outputs.length) return decision.outcome;
  const messages = await messagesFor(client, decision, enrollment, course);
  const claimed = await applyAndDeliver(client, {
    key: providerMessageId,
    enrollment,
    state: decision.state,
    attempt: decision.attempt,
    outcome: decision.outcome,
    messages,
    send,
  });
  return claimed ? decision.outcome : "duplicate";
}
