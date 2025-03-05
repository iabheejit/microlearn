
import { supabase } from "@/integrations/supabase/client";
import { checkAuth } from "./utils";

// Delete a course
export const deleteCourse = async (id: number | string): Promise<void> => {
  try {
    // Check if user is authenticated
    await checkAuth();

    // Delete the course (cascade will handle days and paragraphs)
    const { error } = await supabase
      .from('courses')
      .delete()
      .eq('id', id.toString());

    if (error) throw error;
  } catch (error) {
    console.error(`Error deleting course ${id}:`, error);
    throw new Error(`Failed to delete course: ${(error as Error).message}`);
  }
};
