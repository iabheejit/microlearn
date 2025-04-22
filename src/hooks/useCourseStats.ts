
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CourseStats {
  name: string;
  enrolled: number;
  completion: number;
}

export const useCourseStats = () => {
  return useQuery({
    queryKey: ["course-stats"],
    queryFn: async (): Promise<CourseStats[]> => {
      const { data: courses, error } = await supabase
        .from("courses")
        .select(`
          title,
          id,
          user_progress (
            status
          )
        `);

      if (error) {
        console.error("Error fetching course stats:", error);
        return [];
      }

      if (!courses) return [];

      return courses.map(course => {
        // Check if user_progress is an array before using array methods
        const progress = Array.isArray(course.user_progress) ? course.user_progress : [];
        const enrolled = progress.length;
        const completed = progress.filter(p => p.status === "completed").length;
        const completion = enrolled > 0 ? Math.round((completed / enrolled) * 100) : 0;

        return {
          name: course.title,
          enrolled,
          completion
        };
      });
    }
  });
};
