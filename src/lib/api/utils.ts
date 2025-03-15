
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

  // We need to adapt the database structure to match our application model
  // Some fields like completion, enrolled, price, language don't exist in the DB
  // so we provide default values for these fields
  return {
    id: Number(dbCourse.id), // Convert UUID to number for app
    title: dbCourse.title,
    instructor: dbCourse.instructor || "",
    description: dbCourse.description || "",
    category: "", // Default category as it's not in DB
    language: "", // Default language as it's not in DB
    price: 0, // Default price as it's not in DB
    enrolled: 0, // Default enrolled as it's not in DB
    completion: 0, // Default completion as it's not in DB
    status: dbCourse.is_published ? "active" : "draft", // Map is_published to status
    created: new Date(dbCourse.created_at).toISOString().split('T')[0],
    days: courseDays
  };
};

// Helper to prepare course for database insertion
export const appCourseToDbFormat = (course: Course) => {
  // Extract course data for the courses table
  // Only include fields that exist in the database
  const courseData = {
    id: course.id.toString(), // Convert to string for Supabase UUID
    title: course.title || "",
    instructor: course.instructor || "",
    description: course.description || "",
    is_published: course.status === "active" // Map status to is_published
    // We don't include fields that don't exist in the database:
    // category, language, price, enrolled, completion
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
