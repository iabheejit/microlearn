
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchWhatsAppAnalytics } from "@/services/whatsappService";

interface AnalyticsData {
  totalUsers: number;
  activeCourses: number;
  completionRate: number;
  messagesSent: number;
  whatsappStats?: any;
  telegramStats?: any;
}

export const useAnalytics = () => {
  // Base analytics query
  const baseQuery = useQuery({
    queryKey: ["base-analytics"],
    queryFn: async (): Promise<Omit<AnalyticsData, 'whatsappStats' | 'telegramStats'>> => {
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

  // WhatsApp analytics query
  const whatsappQuery = useQuery({
    queryKey: ["whatsapp-analytics"],
    queryFn: async () => {
      try {
        // Get last 30 days of analytics
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const startDate = thirtyDaysAgo.toISOString().split('T')[0];
        const endDate = new Date().toISOString().split('T')[0];
        
        return await fetchWhatsAppAnalytics(startDate, endDate);
      } catch (error) {
        console.error("Error fetching WhatsApp analytics:", error);
        return null;
      }
    },
    enabled: true // Always fetch WhatsApp analytics
  });

  // Telegram analytics query
  const telegramQuery = useQuery({
    queryKey: ["telegram-analytics"],
    queryFn: async () => {
      try {
        // Fetch Telegram analytics (this will call our edge function)
        const response = await fetch(`${window.location.origin}/api/functions/v1/telegram-webhook/getAnalytics`, {
          method: "GET"
        });
        
        if (!response.ok) {
          throw new Error("Failed to fetch Telegram analytics");
        }
        
        const data = await response.json();
        return data.analytics;
      } catch (error) {
        console.error("Error fetching Telegram analytics:", error);
        return null;
      }
    },
    enabled: true // Always fetch Telegram analytics
  });

  // Combine all data
  const isLoading = baseQuery.isLoading || whatsappQuery.isLoading || telegramQuery.isLoading;
  const data: AnalyticsData | undefined = baseQuery.data ? {
    ...baseQuery.data,
    whatsappStats: whatsappQuery.data || {},
    telegramStats: telegramQuery.data || {}
  } : undefined;

  return {
    data,
    isLoading,
    error: baseQuery.error || whatsappQuery.error || telegramQuery.error
  };
};
