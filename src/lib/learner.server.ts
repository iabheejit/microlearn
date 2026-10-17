import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dayInfo,
  decideStep,
  type EnrollmentState,
  type Input,
} from "./course-engine";
import { loadCourse, quizFor } from "./course-data.server";
import { certificateUrls } from "./certificates.server";

// Web learner engine on top of the channel-neutral course engine. Runs only on the server with the
// service-role client: learners never read answer keys or write progress directly; every step is
// applied by apply_web_step, which locks the enrollment and rejects stale steps.

// The generated Database types do not include the web learner tables yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any>;

export class LearnerError extends Error {}

async function webCourse(client: Client, courseId: string) {
  const { data, error } = await client
    .from("courses")
    .select(
      "id,title,description,thumbnail_url,is_published,delivery_channel,web_enrollment_mode",
    )
    .eq("id", courseId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.is_published || data.delivery_channel !== "web")
    return null;
  return data as {
    id: string;
    title: string;
    description: string | null;
    thumbnail_url: string | null;
    web_enrollment_mode: "invite" | "open";
  };
}

type WebEnrollmentRow = {
  id: string;
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

async function enrollmentFor(client: Client, userId: string, courseId: string) {
  const { data, error } = await client
    .from("web_course_enrollments")
    .select("*")
    .eq("course_id", courseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as WebEnrollmentRow | null;
}

// On the web, "delivering" an unlocked day means showing it, so a passed unlock time is simply cleared.
function webState(row: WebEnrollmentRow, now: Date): EnrollmentState {
  const unlocked =
    row.next_unlock_at &&
    now.getTime() >= new Date(row.next_unlock_at).getTime();
  return {
    status: row.status,
    currentResourceId: row.current_resource_id,
    step: row.current_step ?? "lesson",
    progress: row.progress_percentage ?? 0,
    pausedAt: null,
    pauseReminderSentAt: null,
    nextUnlockAt: unlocked ? null : row.next_unlock_at,
    nudgeSentAt: null,
    completedAt: row.completed_at,
  };
}

type CourseCard = {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
};

export async function learnerHome(client: Client, userId: string) {
  const { data: enrollmentRows, error } = await client
    .from("web_course_enrollments")
    .select("course_id,status,progress_percentage")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const enrollments = (enrollmentRows || []) as Array<{
    course_id: string;
    status: string;
    progress_percentage: number;
  }>;
  const { data: courseRows, error: courseError } = await client
    .from("courses")
    .select("id,title,description,thumbnail_url,web_enrollment_mode")
    .eq("is_published", true)
    .eq("delivery_channel", "web");
  if (courseError) throw courseError;
  // Only published web courses are visible; an enrollment in an unpublished course is hidden.
  const courses = new Map(
    (
      (courseRows || []) as Array<CourseCard & { web_enrollment_mode: string }>
    ).map((course) => [course.id, course]),
  );
  const card = (course: CourseCard) => ({
    courseId: course.id,
    title: course.title,
    description: course.description,
    thumbnailUrl: course.thumbnail_url,
  });
  return {
    enrollments: enrollments.flatMap((row) => {
      const course = courses.get(row.course_id);
      return course
        ? [
            {
              ...card(course),
              status: row.status,
              progress: row.progress_percentage,
            },
          ]
        : [];
    }),
    catalog: [...courses.values()]
      .filter(
        (course) =>
          course.web_enrollment_mode === "open" &&
          !enrollments.some((row) => row.course_id === course.id),
      )
      .map(card),
  };
}

export async function joinCourse(
  client: Client,
  userId: string,
  courseId: string,
) {
  const course = await webCourse(client, courseId);
  if (!course || course.web_enrollment_mode !== "open")
    throw new LearnerError("This course is not open for enrollment.");
  const { error } = await client
    .from("web_course_enrollments")
    .upsert(
      { course_id: courseId, user_id: userId, enrolled_via: "self" },
      { onConflict: "course_id,user_id", ignoreDuplicates: true },
    );
  if (error) throw error;
  return { courseId };
}

export async function courseState(
  client: Client,
  userId: string,
  courseId: string,
  now = new Date(),
) {
  const course = await webCourse(client, courseId);
  if (!course) throw new LearnerError("This course is not available.");
  const enrollment = await enrollmentFor(client, userId, courseId);
  if (!enrollment) {
    return {
      state: "not_enrolled" as const,
      course: { title: course.title, description: course.description },
      canJoin: course.web_enrollment_mode === "open",
    };
  }
  const context = await loadCourse(client, courseId);
  const lessons = context.lessons;
  const state = webState(enrollment, now);
  const found = lessons.findIndex(
    (lesson) => lesson.id === state.currentResourceId,
  );
  const index = found < 0 ? 0 : found;
  const base = {
    course: { title: course.title, description: course.description },
    progress: enrollment.progress_percentage,
    lessonCount: lessons.length,
    dayCount: lessons.length ? dayInfo(lessons, 0).dayCount : 0,
    outline: lessons.map((lesson, position) => ({
      id: lesson.id,
      title: lesson.title,
      day: dayInfo(lessons, position).day,
      done: enrollment.status === "completed" || position < index,
    })),
  };
  if (enrollment.status === "completed") {
    const { data: certificate, error } = await client
      .from("web_course_certificates")
      .select("verification_code,issued_at")
      .eq("enrollment_id", enrollment.id)
      .maybeSingle();
    if (error) throw error;
    return {
      ...base,
      state: "completed" as const,
      certificate: certificate
        ? {
            code: certificate.verification_code as string,
            issuedAt: certificate.issued_at as string,
            // Relative links: the browser resolves them against the page it is on.
            ...certificateUrls("", certificate.verification_code as string),
          }
        : null,
    };
  }
  if (enrollment.status === "paused")
    return { ...base, state: "paused" as const };
  if (!lessons.length) return { ...base, state: "empty" as const };
  if (state.nextUnlockAt) {
    return {
      ...base,
      state: "locked" as const,
      unlock: {
        day: dayInfo(lessons, index).day,
        at: state.nextUnlockAt,
        timezone: context.pacing.timezone,
      },
    };
  }
  const lesson = lessons[index];
  const day = dayInfo(lessons, index);
  if (state.step === "question" && state.currentResourceId) {
    const quiz = await quizFor(client, lesson.id);
    if (quiz) {
      return {
        ...base,
        state: "question" as const,
        lesson: {
          id: lesson.id,
          title: lesson.title,
          position: index + 1,
          ...day,
        },
        // The answer key is never sent to the browser.
        quiz: { question: quiz.question, options: quiz.options },
      };
    }
  }
  return {
    ...base,
    state: "learning" as const,
    lesson: {
      id: lesson.id,
      title: lesson.title,
      content: lesson.content,
      position: index + 1,
      ...day,
    },
  };
}

export type StepResult =
  | { status: "question" }
  | { status: "advanced" }
  | { status: "day_complete"; unlockAt: string; timezone: string }
  | { status: "completed"; certificateCode: string | null }
  | { status: "incorrect"; explanation: string | null }
  | {
      status: "correct";
      explanation: string | null;
      next: "advanced" | "day_complete" | "completed";
    }
  | {
      status: "revealed";
      answer: string;
      explanation: string | null;
      next: "advanced" | "day_complete" | "completed";
    }
  | { status: "stale" };

export async function submitStep(
  client: Client,
  userId: string,
  input: {
    courseId: string;
    resourceId: string;
    step: "lesson" | "question";
    answer?: string;
  },
  now = new Date(),
): Promise<StepResult> {
  if (!(await webCourse(client, input.courseId)))
    throw new LearnerError("This course is not available.");
  const enrollment = await enrollmentFor(client, userId, input.courseId);
  if (!enrollment || enrollment.status !== "active")
    throw new LearnerError("You are not active in this course.");
  const context = await loadCourse(client, input.courseId);
  const state = webState(enrollment, now);
  if (state.nextUnlockAt) return { status: "stale" };
  const found = context.lessons.findIndex(
    (lesson) => lesson.id === state.currentResourceId,
  );
  const current = context.lessons[found < 0 ? 0 : found];
  // The learner acted on a lesson or step they are no longer on (another tab, double click): reload.
  if (
    !current ||
    current.id !== input.resourceId ||
    (state.currentResourceId ? state.step : "lesson") !== input.step
  )
    return { status: "stale" };
  if (input.step === "question" && !input.answer?.trim())
    throw new LearnerError("Choose an answer first.");

  // A web learner sees lesson 1 before acting, so their first step starts from it rather than restarting.
  const started: EnrollmentState = state.currentResourceId
    ? state
    : { ...state, currentResourceId: current.id, step: "lesson" };
  const engineInput: Input =
    input.step === "question"
      ? { kind: "answer", text: input.answer ?? "" }
      : { kind: "next" };
  const quiz = await quizFor(client, current.id);
  let priorWrong = 0;
  if (input.step === "question" && quiz) {
    const { count, error: countError } = await client
      .from("web_quiz_attempts")
      .select("id", { count: "exact", head: true })
      .eq("enrollment_id", enrollment.id)
      .eq("question_id", quiz.id)
      .eq("is_correct", false);
    if (countError) throw countError;
    priorWrong = count ?? 0;
  }
  const decision = decideStep({
    state: started,
    lessons: context.lessons,
    quiz,
    pacing: context.pacing,
    input: engineInput,
    now,
    priorWrong,
  });
  if (
    decision.outcome === "hint" ||
    decision.outcome === "inactive" ||
    decision.outcome === "no_lessons"
  )
    return { status: "stale" };

  const { data, error } = await client.rpc("apply_web_step", {
    p_enrollment_id: enrollment.id,
    p_user_id: userId,
    p_expected_version: enrollment.state_version ?? 0,
    p_state: {
      status: decision.state.status,
      current_resource_id: decision.state.currentResourceId,
      current_step: decision.state.step,
      progress_percentage: decision.state.progress,
      paused_at: null,
      pause_reminder_sent_at: null,
      next_unlock_at: decision.state.nextUnlockAt,
      nudge_sent_at: null,
      completed_at: decision.state.completedAt,
    },
    p_attempt: decision.attempt
      ? {
          question_id: decision.attempt.questionId,
          answer: decision.attempt.answer,
          correct: decision.attempt.correct,
        }
      : null,
  });
  if (error) {
    if (error.code === "40001") return { status: "stale" };
    throw error;
  }
  const certificateCode =
    (data as { certificate_code?: string | null } | null)?.certificate_code ??
    null;
  const feedback = decision.outputs.find(
    (output) => output.kind === "feedback",
  );
  const dayComplete = decision.outputs.find(
    (output) => output.kind === "day_complete",
  );
  if (feedback && !feedback.correct && feedback.revealed === undefined)
    return { status: "incorrect", explanation: feedback.explanation };
  const next =
    decision.outcome === "completed"
      ? "completed"
      : decision.outcome === "day_complete"
        ? "day_complete"
        : "advanced";
  if (feedback && feedback.revealed !== undefined)
    return {
      status: "revealed",
      answer: feedback.revealed,
      explanation: feedback.explanation,
      next,
    };
  if (feedback)
    return { status: "correct", explanation: feedback.explanation, next };
  if (decision.outcome === "question") return { status: "question" };
  if (dayComplete)
    return {
      status: "day_complete",
      unlockAt: dayComplete.unlockAt,
      timezone: context.pacing.timezone,
    };
  if (decision.outcome === "completed")
    return { status: "completed", certificateCode };
  return { status: "advanced" };
}

export async function inviteLearner(
  client: Client,
  staffId: string,
  input: { courseId: string; email: string },
) {
  const { data: course, error: courseError } = await client
    .from("courses")
    .select("id,delivery_channel")
    .eq("id", input.courseId)
    .maybeSingle();
  if (courseError) throw courseError;
  if (!course || course.delivery_channel !== "web")
    throw new LearnerError("Only web courses take web learners.");
  const { data: userId, error: lookupError } = await client.rpc(
    "find_auth_user_id_by_email",
    { p_email: input.email },
  );
  if (lookupError) throw lookupError;
  if (!userId)
    throw new LearnerError(
      "No account uses that email yet. Ask the learner to sign up, then invite them.",
    );
  const { data: existing, error: existingError } = await client
    .from("web_course_enrollments")
    .select("id")
    .eq("course_id", input.courseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing)
    throw new LearnerError("This learner is already enrolled in this course.");
  const { error } = await client.from("web_course_enrollments").insert({
    course_id: input.courseId,
    user_id: userId,
    enrolled_via: "invite",
    enrolled_by: staffId,
  });
  if (error) throw error;
  return { userId: userId as string };
}

export async function listWebEnrollments(client: Client, courseId: string) {
  const { data, error } = await client
    .from("web_course_enrollments")
    .select(
      "id,user_id,status,progress_percentage,enrolled_via,started_at,completed_at",
    )
    .eq("course_id", courseId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = (data || []) as Array<{
    id: string;
    user_id: string;
    status: string;
    progress_percentage: number;
    enrolled_via: string;
    started_at: string;
    completed_at: string | null;
  }>;
  const people = await Promise.all(
    rows.map(async (row) => {
      const { data: result } = await client.auth.admin.getUserById(row.user_id);
      return result?.user?.email ?? null;
    }),
  );
  return rows.map((row, position) => ({
    id: row.id,
    email: people[position],
    status: row.status,
    progress: row.progress_percentage,
    enrolledVia: row.enrolled_via,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }));
}
