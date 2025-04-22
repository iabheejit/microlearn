import { Course, CourseDay, CourseParagraph } from "../types";
import { supabase } from "@/integrations/supabase/client";

// Helper to convert database course format to application format
export const dbCourseToAppCourse = (dbCourse: any, days: any[] = []): Course => {
  const courseDays = days.map(day => ({
    id: day.day_number,
    title: day.title,
    paragraphs: day.paragraphs?.map((para: any) => ({
      id: para.paragraph_number,
      content: para.content
    })) || [],
    media: day.media
  }));

  return {
    id: dbCourse.id, // Keep as string, no conversion needed
    title: dbCourse.title,
    instructor: dbCourse.instructor || "",
    description: dbCourse.description || "",
    category: dbCourse.category || "",
    language: dbCourse.language || "",
    price: dbCourse.price || 0,
    enrolled: dbCourse.enrolled_count || 0,
    completion: dbCourse.completion_rate || 0,
    status: dbCourse.is_published ? "active" : "draft",
    created: new Date(dbCourse.created_at).toISOString().split('T')[0],
    days: courseDays,
  };
};

// Helper to prepare course for database insertion
export const appCourseToDbFormat = (course: Course) => {
  const courseId = course.id || crypto.randomUUID();

  const courseData = {
    id: courseId,
    title: course.title || "",
    instructor: course.instructor || "",
    description: course.description || "",
    category: course.category || "",
    language: course.language || "",
    price: course.price || 0,
    enrolled_count: course.enrolled || 0,
    completion_rate: course.completion || 0,
    is_published: course.status === "active"
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
