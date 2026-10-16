import type { SupabaseClient } from "@supabase/supabase-js";
import { decideStep } from "./course-engine";
import {
  pauseReminderMessage,
  type OutgoingMessage,
} from "./whatsapp-course-messages";
import {
  applyAndDeliver,
  deliverEvent,
  loadCourse,
  messagesFor,
  quizFor,
  stateOf,
  type CourseContext,
  type EnrollmentRow,
  type Send,
} from "./whatsapp-progression.server";
import type { ReplyTemplate } from "./whatsapp-template";

// Runs every 5 minutes (pg_cron → /api/public/course-scheduler). It delivers course days that have
// unlocked and reminds paused learners. Inside the 24-hour window it sends the lesson or reminder
// directly; outside it, it sends the course's approved nudge template, whose button resumes the course.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any>;

const BATCH = 25;
// Stay clear of the 24-hour edge so a send never races the window closing.
const WINDOW_MS = 23.5 * 60 * 60 * 1000;
const STUCK_AFTER_MS = 2 * 60 * 1000;

export type SchedulerDeps = {
  send: Send;
  /** Approved templates on the linked WABA (rechecked every run). */
  templates: () => Promise<ReplyTemplate[]>;
  now: Date;
};

export type SchedulerResult = { enrollmentId: string; action: string };

async function windowOpen(client: Client, phone: string, now: Date) {
  const { data, error } = await client
    .from("whatsapp_messages")
    .select("sent_at")
    .eq("phone_number", phone)
    .eq("direction", "incoming")
    .order("sent_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const last = data?.[0]?.sent_at;
  return Boolean(last) && now.getTime() - new Date(last).getTime() < WINDOW_MS;
}

function nudgeMessage(
  course: CourseContext,
  enrollment: EnrollmentRow,
  templates: ReplyTemplate[],
): OutgoingMessage | string {
  if (!course.nudgeTemplate) return "no_nudge_template";
  const template = templates.find(
    (item) =>
      item.name === course.nudgeTemplate?.name &&
      item.language === course.nudgeTemplate?.language,
  );
  if (!template) return "nudge_template_not_approved";
  // Nudge templates take {{1}} learner name and {{2}} course title (either may be omitted).
  if (template.variables.length > 2) return "nudge_template_needs_more_values";
  const values = [enrollment.learner_name, course.title].slice(
    0,
    template.variables.length,
  );
  return {
    payload: {
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language },
        components: values.length
          ? [
              {
                type: "body",
                parameters: values.map((text) => ({ type: "text", text })),
              },
            ]
          : [],
      },
    },
    content: template.body.replace(
      /\{\{(\d+)\}\}/g,
      (match, position) => values[Number(position) - 1] ?? match,
    ),
  };
}

async function retryStuckDeliveries(
  client: Client,
  deps: SchedulerDeps,
  results: SchedulerResult[],
) {
  const { data, error } = await client
    .from("whatsapp_progression_events")
    .select("id,enrollment_id,response_messages,delivered_count,created_at")
    .eq("status", "pending")
    .not("response_messages", "is", null)
    .lt(
      "created_at",
      new Date(deps.now.getTime() - STUCK_AFTER_MS).toISOString(),
    )
    .limit(BATCH);
  if (error) throw error;
  for (const event of data ?? []) {
    const { data: enrollment, error: enrollmentError } = await client
      .from("whatsapp_course_enrollments")
      .select("phone_number")
      .eq("id", event.enrollment_id)
      .single();
    if (enrollmentError) throw enrollmentError;
    try {
      await deliverEvent(client, event, enrollment.phone_number, deps.send);
      results.push({
        enrollmentId: event.enrollment_id,
        action: "redelivered",
      });
    } catch (error) {
      console.error("Course scheduler could not redeliver", event.id, error);
      results.push({
        enrollmentId: event.enrollment_id,
        action: "redelivery_failed",
      });
    }
  }
}

export async function runCourseScheduler(client: Client, deps: SchedulerDeps) {
  const results: SchedulerResult[] = [];
  const nowIso = deps.now.toISOString();
  await retryStuckDeliveries(client, deps, results);

  const { data: due, error: dueError } = await client
    .from("whatsapp_course_enrollments")
    .select("*")
    .eq("status", "active")
    .lte("next_unlock_at", nowIso)
    .is("nudge_sent_at", null)
    .limit(BATCH);
  if (dueError) throw dueError;
  const { data: paused, error: pausedError } = await client
    .from("whatsapp_course_enrollments")
    .select("*")
    .eq("status", "active")
    .not("paused_at", "is", null)
    .is("pause_reminder_sent_at", null)
    .is("next_unlock_at", null)
    .limit(BATCH);
  if (pausedError) throw pausedError;

  const courses = new Map<string, CourseContext>();
  const course = async (id: string) => {
    if (!courses.has(id)) courses.set(id, await loadCourse(client, id));
    return courses.get(id) as CourseContext;
  };
  let templates: ReplyTemplate[] | null = null;
  const approved = async () => (templates ??= await deps.templates());

  const work = [
    ...((due ?? []) as EnrollmentRow[]).map((enrollment) => ({
      enrollment,
      kind: "unlock" as const,
    })),
    ...((paused ?? []) as EnrollmentRow[]).map((enrollment) => ({
      enrollment,
      kind: "reminder" as const,
    })),
  ];
  for (const { enrollment, kind } of work) {
    try {
      const context = await course(enrollment.course_id);
      if (kind === "reminder") {
        const hours = context.pauseReminderHours;
        if (
          !hours ||
          deps.now.getTime() -
            new Date(enrollment.paused_at as string).getTime() <
            hours * 60 * 60 * 1000
        )
          continue;
      }
      const state = stateOf(enrollment);
      const key = `scheduler:${kind}:${enrollment.id}:${enrollment.state_version ?? 0}`;
      if (await windowOpen(client, enrollment.phone_number, deps.now)) {
        if (kind === "unlock") {
          const decision = decideStep({
            state,
            lessons: context.lessons,
            quiz: await quizFor(client, enrollment.current_resource_id),
            pacing: context.pacing,
            input: { kind: "resume" },
            now: deps.now,
          });
          if (decision.outcome !== "unlocked") continue;
          const messages = await messagesFor(
            client,
            decision,
            enrollment,
            context,
          );
          await applyAndDeliver(client, {
            key,
            enrollment,
            state: decision.state,
            attempt: null,
            outcome: "unlocked",
            messages,
            send: deps.send,
          });
          results.push({ enrollmentId: enrollment.id, action: "unlocked" });
        } else {
          await applyAndDeliver(client, {
            key,
            enrollment,
            state: { ...state, pauseReminderSentAt: nowIso },
            attempt: null,
            outcome: "pause_reminder",
            messages: [pauseReminderMessage(context.title)],
            send: deps.send,
          });
          results.push({ enrollmentId: enrollment.id, action: "reminded" });
        }
        continue;
      }
      // Window closed: only an approved template may open the conversation.
      const nudge = nudgeMessage(context, enrollment, await approved());
      if (typeof nudge === "string") {
        results.push({ enrollmentId: enrollment.id, action: nudge });
        continue;
      }
      await applyAndDeliver(client, {
        key,
        enrollment,
        state:
          kind === "unlock"
            ? { ...state, nudgeSentAt: nowIso }
            : { ...state, pauseReminderSentAt: nowIso },
        attempt: null,
        outcome: kind === "unlock" ? "unlock_nudge" : "pause_nudge",
        messages: [nudge],
        send: deps.send,
      });
      results.push({
        enrollmentId: enrollment.id,
        action: kind === "unlock" ? "unlock_nudged" : "pause_nudged",
      });
    } catch (error) {
      // One learner's failure must not block the rest; a conflict means a reply got there first.
      console.error("Course scheduler step failed", enrollment.id, error);
      results.push({ enrollmentId: enrollment.id, action: "failed" });
    }
  }
  return results;
}
