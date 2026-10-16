import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lesson, Pacing, PacingMode, Quiz } from "./course-engine";

// Loads a course's lessons (in day/module order), pacing settings and quizzes for the course engine.
// Server-only: quiz answer keys are read here and must never be sent to the browser.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any>;

export type CourseContext = {
  id: string;
  title: string;
  lessonIntro: string | null;
  completionMessage: string | null;
  pacing: Pacing;
  pauseReminderHours: number;
  nudgeTemplate: { name: string; language: string } | null;
  lessons: Lesson[];
};

export async function loadCourse(
  client: Client,
  courseId: string,
): Promise<CourseContext> {
  const { data: course, error } = await client
    .from("courses")
    .select(
      "id,title,whatsapp_lesson_intro,whatsapp_completion_message,pacing_mode,pacing_gap_days,pacing_unlock_time,pacing_timezone,pause_reminder_hours,whatsapp_nudge_template_name,whatsapp_nudge_template_language",
    )
    .eq("id", courseId)
    .single();
  if (error) throw error;
  const { data: modules, error: moduleError } = await client
    .from("course_modules")
    .select("id")
    .eq("course_id", courseId)
    .order("order_index");
  if (moduleError) throw moduleError;
  let lessons: Lesson[] = [];
  if (modules?.length) {
    const { data: resources, error: resourceError } = await client
      .from("course_resources")
      .select("id,module_id,title,content,order_index")
      .in(
        "module_id",
        modules.map((module: { id: string }) => module.id),
      )
      .order("order_index");
    if (resourceError) throw resourceError;
    lessons = modules.flatMap((module: { id: string }) =>
      (resources ?? [])
        .filter(
          (resource: { module_id: string }) => resource.module_id === module.id,
        )
        .map(
          (resource: {
            id: string;
            module_id: string;
            title: string | null;
            content: string | null;
          }) => ({
            id: resource.id,
            moduleId: resource.module_id,
            title: resource.title || "Lesson",
            content: resource.content || "",
          }),
        ),
    );
  }
  return {
    id: course.id,
    title: course.title,
    lessonIntro: course.whatsapp_lesson_intro ?? null,
    completionMessage: course.whatsapp_completion_message ?? null,
    pacing: {
      mode: (course.pacing_mode ?? "immediate") as PacingMode,
      gapDays: course.pacing_gap_days ?? 1,
      unlockTime: course.pacing_unlock_time ?? "09:00",
      timezone: course.pacing_timezone ?? "UTC",
    },
    pauseReminderHours: course.pause_reminder_hours ?? 24,
    nudgeTemplate: course.whatsapp_nudge_template_name
      ? {
          name: course.whatsapp_nudge_template_name,
          language: course.whatsapp_nudge_template_language || "en_US",
        }
      : null,
    lessons,
  };
}

export async function quizFor(
  client: Client,
  resourceId: string | null,
): Promise<Quiz | null> {
  if (!resourceId) return null;
  const { data, error } = await client
    .from("course_quiz_questions")
    .select("id,question,options,correct_answer,explanation")
    .eq("resource_id", resourceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    question: data.question,
    options: (Array.isArray(data.options) ? data.options : []).filter(
      (option: unknown): option is string => typeof option === "string",
    ),
    correctAnswer: data.correct_answer,
    explanation: data.explanation ?? null,
  };
}
