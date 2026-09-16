
import { Course } from "../types";
import { supabase } from "@/integrations/supabase/client";
import { dbCourseToAppCourse } from "./utils";

// Fetch all courses
export const fetchCourses = async (): Promise<Course[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("Sign in to view courses");
    }

    // Query the courses table
    const { data: courses, error } = await supabase
      .from('courses')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // For each course, fetch its days and paragraphs
    const coursesWithDays = await Promise.all(
      courses.map(async (course) => {
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
      })
    );

    return coursesWithDays;
  } catch (error) {
    console.error('Error fetching courses:', error);
    throw error;
  }
};
