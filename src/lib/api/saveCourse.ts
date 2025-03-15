
import { Course } from "../types";
import { supabase } from "@/integrations/supabase/client";
import { dbCourseToAppCourse, appCourseToDbFormat, checkAuth } from "./utils";

// Save a course (create or update)
export const saveCourse = async (course: Course): Promise<Course> => {
  try {
    // Check if user is authenticated
    const user = await checkAuth();

    const { courseData, days } = appCourseToDbFormat(course);
    
    // Add created_by field to courseData if it's a new course
    const dataWithCreatedBy = {
      ...courseData,
      created_by: user.id
    };

    console.log("Saving course with data:", dataWithCreatedBy);

    // Insert or update the course
    const { data: savedCourse, error } = await supabase
      .from('courses')
      .upsert(dataWithCreatedBy)
      .select()
      .single();

    if (error) {
      console.error("Error upserting course:", error);
      throw error;
    }

    // Process days - we'll delete existing days and recreate them
    // First, delete all existing days for this course
    const { error: deleteError } = await supabase
      .from('course_days')
      .delete()
      .eq('course_id', savedCourse.id);

    if (deleteError) {
      console.error("Error deleting course days:", deleteError);
      throw deleteError;
    }

    // Create new days
    const daysPromises = days.map(async (day, index) => {
      const { data: savedDay, error: dayError } = await supabase
        .from('course_days')
        .insert({
          course_id: savedCourse.id,
          day_number: index + 1,
          title: day.title,
          media: day.media
        })
        .select()
        .single();

      if (dayError) {
        console.error("Error inserting course day:", dayError);
        throw dayError;
      }

      // Create paragraphs for this day
      const paragraphsPromises = day.paragraphs.map(async (para, paraIndex) => {
        const { error: paraError } = await supabase
          .from('course_paragraphs')
          .insert({
            day_id: savedDay.id,
            paragraph_number: paraIndex + 1,
            content: para.content
          });

        if (paraError) {
          console.error("Error inserting paragraph:", paraError);
          throw paraError;
        }
      });

      await Promise.all(paragraphsPromises);
      
      return {
        ...savedDay,
        paragraphs: day.paragraphs.map((para, paraIndex) => ({
          paragraph_number: paraIndex + 1,
          content: para.content
        }))
      };
    });

    const savedDays = await Promise.all(daysPromises);
    
    return dbCourseToAppCourse(savedCourse, savedDays);
  } catch (error) {
    console.error('Error saving course:', error);
    throw new Error(`Failed to save course: ${(error as Error).message}`);
  }
};
