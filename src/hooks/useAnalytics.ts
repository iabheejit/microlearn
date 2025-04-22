
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface AnalyticsData {
  totalUsers: number;
  activeCourses: number;
  completionRate: number;
  messagesSent: number;
}

export const useAnalytics = () => {
  return useQuery({
    queryKey: ["analytics"],
    queryFn: async (): Promise<AnalyticsData> => {
      // Fetch total users
      const { count: totalUsers } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });

      // Fetch active courses
      const { count: activeCourses } = await supabase
        .from("courses")
        .select("*", { count: "exact", head: true })
        .eq("is_published", true);

      // Calculate completion rate
      const { data: progress } = await supabase
        .from("user_progress")
        .select("status");

      const completed = progress?.filter(p => p.status === "completed").length || 0;
      const total = progress?.length || 1;
      const completionRate = (completed / total) * 100;

      // Count messages (analytics events of type 'message')
      const { count: messagesSent } = await supabase
        .from("analytics")
        .select("*", { count: "exact", head: true })
        .eq("event_type", "message");

      return {
        totalUsers: totalUsers || 0,
        activeCourses: activeCourses || 0,
        completionRate: Math.round(completionRate),
        messagesSent: messagesSent || 0
      };
    }
  });
};
