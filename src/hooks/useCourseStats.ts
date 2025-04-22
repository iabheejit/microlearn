
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
      const { data: courses } = await supabase
        .from("courses")
        .select(`
          title,
          id,
          user_progress (
            status
          )
        `);

      if (!courses) return [];

      return courses.map(course => {
        const progress = course.user_progress || [];
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
