
import { Course } from "../types";
import { MOCK_COURSES } from "../constants";
import { supabase } from "@/integrations/supabase/client";
import { dbCourseToAppCourse } from "./utils";

// Fetch a single course by ID
export const fetchCourse = async (id: number | string): Promise<Course> => {
  try {
    // If we're not authenticated, find in mock courses for development
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log("User not authenticated, returning mock course");
      const mockCourse = MOCK_COURSES.find(c => c.id === id.toString());
      if (!mockCourse) throw new Error(`Course with ID ${id} not found`);
      return mockCourse;
    }

    // For Supabase, ensure we have a valid ID format
    if (id === null || id === undefined || id.toString() === "NaN") {
      throw new Error(`Invalid course ID: ${id}`);
    }
    
    // Determine if this is a UUID (string from Supabase) or number (from mock data)
    const isUuid = typeof id === 'string' && id.includes('-');
    const courseIdForQuery = id.toString();
    
    console.log(`Fetching course with ID: ${courseIdForQuery}, isUuid: ${isUuid}`);

    // Query the course
    const { data: course, error } = await supabase
      .from('courses')
      .select('*')
      .eq('id', courseIdForQuery)
      .single();

    if (error) throw error;

    // Fetch the days for this course
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
  } catch (error) {
    console.error(`Error fetching course ${id}:`, error);
    
    // Fallback to mock data in case of error
    const mockCourse = MOCK_COURSES.find(c => c.id === id.toString());
    if (!mockCourse) throw new Error(`Course with ID ${id} not found`);
    
    return mockCourse;
  }
};
