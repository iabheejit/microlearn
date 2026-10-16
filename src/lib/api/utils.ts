import { Course } from "../types";
import { supabase } from "@/integrations/supabase/client";

// Helper to convert database course format to application format
export const dbCourseToAppCourse = (dbCourse: any, days: any[] = []): Course => {
  const courseDays = days.map(day => ({
    id: day.id,
    title: day.title,
    paragraphs: day.paragraphs?.map((para: any) => ({
      id: para.id,
      content: para.content
    })) || [],
    media: day.description || undefined
  }));

  return {
    id: dbCourse.id, // Keep as string, no conversion needed
    title: dbCourse.title,
    instructor: dbCourse.instructor || "",
    description: dbCourse.description || "",
    category: dbCourse.category || "",
    language: dbCourse.language || "",
    price: Number(dbCourse.price || 0),
    enrolled: 0,
    completion: 0,
    status: dbCourse.is_published ? "active" : "draft",
    created: new Date(dbCourse.created_at).toISOString().split('T')[0],
    days: courseDays,
    whatsappWelcomeTemplateKey: dbCourse.whatsapp_welcome_template_key || "course_welcome",
    whatsappLessonIntro: dbCourse.whatsapp_lesson_intro || "",
    whatsappCompletionMessage: dbCourse.whatsapp_completion_message || "",
    deliveryChannel: dbCourse.delivery_channel || "whatsapp",
    webEnrollmentMode: dbCourse.web_enrollment_mode || "invite",
    pacingMode: dbCourse.pacing_mode || "immediate",
    pacingGapDays: dbCourse.pacing_gap_days ?? 1,
    pacingUnlockTime: dbCourse.pacing_unlock_time || "09:00",
    pacingTimezone: dbCourse.pacing_timezone || "UTC",
    pauseReminderHours: dbCourse.pause_reminder_hours ?? 24,
    whatsappNudgeTemplateName: dbCourse.whatsapp_nudge_template_name || "",
    whatsappNudgeTemplateLanguage: dbCourse.whatsapp_nudge_template_language || "",
  };
};

// Helper to prepare course for database insertion
export const appCourseToDbFormat = (course: Course) => {
  const courseId = course.id || crypto.randomUUID();

  const courseData = {
    id: courseId,
    title: course.title || "",
    description: course.description || "",
    instructor: course.instructor || null,
    category: course.category || null,
    language: course.language || null,
    price: course.price || 0,
    whatsapp_welcome_template_key: course.whatsappWelcomeTemplateKey?.trim() || "course_welcome",
    whatsapp_lesson_intro: course.whatsappLessonIntro?.trim() || null,
    whatsapp_completion_message: course.whatsappCompletionMessage?.trim() || null,
    delivery_channel: course.deliveryChannel || "whatsapp",
    web_enrollment_mode: course.webEnrollmentMode || "invite",
    pacing_mode: course.pacingMode || "immediate",
    pacing_gap_days: Math.min(Math.max(Math.round(course.pacingGapDays ?? 1), 1), 30),
    pacing_unlock_time: /^([01]\d|2[0-3]):[0-5]\d$/.test(course.pacingUnlockTime ?? "") ? course.pacingUnlockTime : "09:00",
    pacing_timezone: course.pacingTimezone || "UTC",
    pause_reminder_hours: Math.min(Math.max(Math.round(course.pauseReminderHours ?? 24), 0), 168),
    whatsapp_nudge_template_name: course.whatsappNudgeTemplateName || null,
    whatsapp_nudge_template_language: course.whatsappNudgeTemplateName ? course.whatsappNudgeTemplateLanguage || null : null,
    is_published: course.status === "active",
    status: course.status === "active" ? "published" as const : course.status
  };

  return { courseData, days: course.days || [] };
};

// Check if user is authenticated and return user
export const checkAuth = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error("User not authenticated. Please sign in.");
  }
  return user;
};
