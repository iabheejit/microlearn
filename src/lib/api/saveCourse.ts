
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

    // Replace the course modules and their cascading resources.
    const { error: deleteError } = await supabase
      .from('course_modules')
      .delete()
      .eq('course_id', savedCourse.id);

    if (deleteError) {
      console.error("Error deleting course days:", deleteError);
      throw deleteError;
    }

    // Create new days
    const daysPromises = days.map(async (day, index) => {
      const { data: savedDay, error: dayError } = await supabase
        .from('course_modules')
        .insert({
          course_id: savedCourse.id,
          order_index: index + 1,
          title: day.title,
          description: day.media || null
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
          .from('course_resources')
          .insert({
            module_id: savedDay.id,
            order_index: paraIndex + 1,
            title: `Section ${paraIndex + 1}`,
            resource_type: 'text',
            content: para.content,
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
          order_index: paraIndex + 1,
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
