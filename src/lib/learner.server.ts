import type { SupabaseClient } from "@supabase/supabase-js";
import { gradeQuizAnswer } from "../../supabase/functions/_shared/whatsapp-logic.ts";

// Web learner engine. Runs only on the server with the service-role client: learners never read
// answer keys or write progress directly; every step is applied by apply_web_progression.

// The generated Database types do not include the web learner tables yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any>;

export class LearnerError extends Error {}

type Lesson = { id: string; title: string; content: string };

export async function orderedLessons(
  client: Client,
  courseId: string,
): Promise<Lesson[]> {
  const { data: modules, error: moduleError } = await client
    .from("course_modules")
    .select("id")
    .eq("course_id", courseId)
    .order("order_index");
  if (moduleError) throw moduleError;
  if (!modules?.length) return [];
  const { data: resources, error: resourceError } = await client
    .from("course_resources")
    .select("id,module_id,title,content,order_index")
    .in(
      "module_id",
      modules.map((module: { id: string }) => module.id),
    )
    .order("order_index");
  if (resourceError) throw resourceError;
  return modules.flatMap((module: { id: string }) =>
    (resources || [])
      .filter(
        (resource: { module_id: string }) => resource.module_id === module.id,
      )
      .map(
        (resource: {
          id: string;
          title: string | null;
          content: string | null;
        }) => ({
          id: resource.id,
          title: resource.title || "Lesson",
          content: resource.content || "",
        }),
      ),
  );
}

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

async function enrollmentFor(client: Client, userId: string, courseId: string) {
  const { data, error } = await client
    .from("web_course_enrollments")
    .select("id,status,current_resource_id,progress_percentage,completed_at")
    .eq("course_id", courseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as {
    id: string;
    status: "active" | "completed" | "paused";
    current_resource_id: string | null;
    progress_percentage: number;
    completed_at: string | null;
  } | null;
}

// A NULL position means the learner is on the first lesson.
const currentIndexOf = (lessons: Lesson[], currentResourceId: string | null) =>
  currentResourceId
    ? Math.max(
        lessons.findIndex((lesson) => lesson.id === currentResourceId),
        0,
      )
    : 0;

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
  const lessons = await orderedLessons(client, courseId);
  const base = {
    course: { title: course.title, description: course.description },
    progress: enrollment.progress_percentage,
    lessonCount: lessons.length,
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
      outline: lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        done: true,
      })),
      certificate: certificate
        ? {
            code: certificate.verification_code as string,
            issuedAt: certificate.issued_at as string,
          }
        : null,
    };
  }
  if (enrollment.status === "paused")
    return { ...base, state: "paused" as const };
  if (!lessons.length) return { ...base, state: "empty" as const };

  const index = currentIndexOf(lessons, enrollment.current_resource_id);
  const lesson = lessons[index];
  const { data: quiz, error: quizError } = await client
    .from("course_quiz_questions")
    .select("question,options")
    .eq("resource_id", lesson.id)
    .maybeSingle();
  if (quizError) throw quizError;
  return {
    ...base,
    state: "learning" as const,
    outline: lessons.map((item, position) => ({
      id: item.id,
      title: item.title,
      done: position < index,
    })),
    lesson: {
      ...lesson,
      position: index + 1,
      // The answer key is never sent to the browser.
      quiz: quiz
        ? {
            question: quiz.question as string,
            options: (Array.isArray(quiz.options) ? quiz.options : []).filter(
              (option: unknown): option is string => typeof option === "string",
            ),
          }
        : null,
    },
  };
}

export type StepResult =
  | { status: "advanced" }
  | { status: "completed"; certificateCode: string | null }
  | { status: "incorrect"; explanation: string | null }
  | { status: "stale" };

export async function submitStep(
  client: Client,
  userId: string,
  input: { courseId: string; resourceId: string; answer?: string },
): Promise<StepResult> {
  if (!(await webCourse(client, input.courseId)))
    throw new LearnerError("This course is not available.");
  const enrollment = await enrollmentFor(client, userId, input.courseId);
  if (!enrollment || enrollment.status !== "active")
    throw new LearnerError("You are not active in this course.");
  const lessons = await orderedLessons(client, input.courseId);
  const index = currentIndexOf(lessons, enrollment.current_resource_id);
  // The learner submitted a lesson they are no longer on (another tab, double click): reload.
  if (lessons[index]?.id !== input.resourceId) return { status: "stale" };

  const { data: quiz, error: quizError } = await client
    .from("course_quiz_questions")
    .select("id,options,correct_answer,explanation")
    .eq("resource_id", input.resourceId)
    .maybeSingle();
  if (quizError) throw quizError;
  const answer = input.answer?.trim() ?? "";
  if (quiz && !answer) throw new LearnerError("Choose an answer first.");
  const correct = quiz
    ? gradeQuizAnswer(
        answer,
        Array.isArray(quiz.options) ? quiz.options : [],
        quiz.correct_answer,
      )
    : true;

  const next = lessons[index + 1];
  const complete = correct && !next;
  const { data, error } = await client.rpc("apply_web_progression", {
    p_enrollment_id: enrollment.id,
    p_user_id: userId,
    p_expected_resource_id: enrollment.current_resource_id,
    p_question_id: quiz?.id ?? null,
    p_submitted_answer: quiz ? answer.slice(0, 4096) : null,
    p_is_correct: quiz ? correct : null,
    p_advance: correct && Boolean(next),
    p_next_resource_id: correct && next ? next.id : null,
    p_progress: Math.round(((index + 1) / lessons.length) * 100),
    p_complete: complete,
  });
  if (error) {
    if (error.code === "40001") return { status: "stale" };
    throw error;
  }
  if (!correct)
    return { status: "incorrect", explanation: quiz?.explanation ?? null };
  if (complete)
    return {
      status: "completed",
      certificateCode:
        (data as { certificate_code?: string | null } | null)
          ?.certificate_code ?? null,
    };
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
