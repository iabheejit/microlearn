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
