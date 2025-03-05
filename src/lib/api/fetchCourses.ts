
import { Course } from "../types";
import { MOCK_COURSES } from "../constants";
import { supabase } from "@/integrations/supabase/client";
import { dbCourseToAppCourse } from "./utils";

// Fetch all courses
export const fetchCourses = async (): Promise<Course[]> => {
  try {
    // If we're not authenticated, return mock courses for development
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log("User not authenticated, returning mock courses");
      return MOCK_COURSES;
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
          .from('course_days')
          .select('*')
          .eq('course_id', course.id)
          .order('day_number', { ascending: true });

        if (daysError) throw daysError;

        // For each day, fetch its paragraphs
        const daysWithParagraphs = await Promise.all(
          days.map(async (day) => {
            const { data: paragraphs, error: paragraphsError } = await supabase
              .from('course_paragraphs')
              .select('*')
              .eq('day_id', day.id)
              .order('paragraph_number', { ascending: true });

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
    return MOCK_COURSES; // Fallback to mock data in case of error
  }
};
