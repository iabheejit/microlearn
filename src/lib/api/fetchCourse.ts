
import { Course } from "../types";
import { supabase } from "@/integrations/supabase/client";
import { dbCourseToAppCourse } from "./utils";

// Fetch a single course by ID
export const fetchCourse = async (id: number | string): Promise<Course> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("Sign in to view this course");
    }

    // For Supabase, ensure we have a valid ID format
    if (id === null || id === undefined || id.toString() === "NaN") {
      throw new Error(`Invalid course ID: ${id}`);
    }
    
    const courseIdForQuery = id.toString();

    // Query the course
    const { data: course, error } = await supabase
      .from('courses')
      .select('*')
      .eq('id', courseIdForQuery)
      .single();

    if (error) throw error;

    // Fetch the modules for this course
    const { data: days, error: daysError } = await supabase
      .from('course_modules')
      .select('*')
      .eq('course_id', course.id)
      .order('order_index', { ascending: true });

    if (daysError) throw daysError;

    // For each day, fetch its paragraphs
    const daysWithParagraphs = await Promise.all(
      days.map(async (day) => {
        const { data: paragraphs, error: paragraphsError } = await supabase
          .from('course_resources')
          .select('*')
          .eq('module_id', day.id)
          .order('order_index', { ascending: true });

        if (paragraphsError) throw paragraphsError;

        return { ...day, paragraphs };
      })
    );

    return dbCourseToAppCourse(course, daysWithParagraphs);
  } catch (error) {
    console.error(`Error fetching course ${id}:`, error);
    
    throw error;
  }
};
