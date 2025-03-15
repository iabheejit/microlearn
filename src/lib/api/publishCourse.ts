
import { Course } from "../types";
import { supabase } from "@/integrations/supabase/client";
import { checkAuth } from "./utils";
import { fetchCourse } from "./fetchCourse";

// Publish a course
export const publishCourse = async (id: number | string): Promise<Course> => {
  try {
    // Check if user is authenticated
    await checkAuth();

    // Update the course status to published
    const { data: updatedCourse, error } = await supabase
      .from('courses')
      .update({ is_published: true })
      .eq('id', id.toString())
      .select()
      .single();

    if (error) throw error;

    return fetchCourse(id); // Fetch the complete course with days and paragraphs
  } catch (error) {
    console.error(`Error publishing course ${id}:`, error);
    throw new Error(`Failed to publish course: ${(error as Error).message}`);
  }
};
