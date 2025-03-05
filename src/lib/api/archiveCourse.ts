
import { Course } from "../types";
import { supabase } from "@/integrations/supabase/client";
import { checkAuth } from "./utils";
import { fetchCourse } from "./fetchCourse";

// Archive a course
export const archiveCourse = async (id: number | string): Promise<Course> => {
  try {
    // Check if user is authenticated
    await checkAuth();

    // Update the course status to archived
    const { data: updatedCourse, error } = await supabase
      .from('courses')
      .update({ is_published: false })
      .eq('id', id.toString())
      .select()
      .single();

    if (error) throw error;

    return fetchCourse(id); // Fetch the complete course with days and paragraphs
  } catch (error) {
    console.error(`Error archiving course ${id}:`, error);
    throw new Error(`Failed to archive course: ${(error as Error).message}`);
  }
};
