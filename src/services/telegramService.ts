
import { supabase } from "@/integrations/supabase/client";

export const fetchTelegramAnalytics = async (): Promise<any> => {
  try {
    // Call our telegram-webhook edge function with the getAnalytics path
    const response = await fetch(`${window.location.origin}/api/functions/v1/telegram-webhook/getAnalytics`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${supabase.auth.session()?.access_token}`
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error("Error fetching Telegram analytics:", errorData);
      throw new Error("Failed to fetch Telegram analytics");
    }
    
    const data = await response.json();
    return data.analytics;
  } catch (error) {
    console.error("Error fetching Telegram analytics:", error);
    throw error;
  }
};

export const fetchTelegramUpdates = async (): Promise<any[]> => {
  try {
    // Call our telegram-webhook edge function with the getUpdates path
    const response = await fetch(`${window.location.origin}/api/functions/v1/telegram-webhook/getUpdates`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${supabase.auth.session()?.access_token}`
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error("Error fetching Telegram updates:", errorData);
      throw new Error("Failed to fetch Telegram updates");
    }
    
    const data = await response.json();
    return data.updates || [];
  } catch (error) {
    console.error("Error fetching Telegram updates:", error);
    throw error;
  }
};

export const sendTelegramMessage = async (chatId: string, text: string): Promise<any> => {
  try {
    // Call our telegram-webhook edge function with the sendMessage path
    const response = await fetch(`${window.location.origin}/api/functions/v1/telegram-webhook/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabase.auth.session()?.access_token}`
      },
      body: JSON.stringify({ chatId, text })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error("Error sending Telegram message:", errorData);
      throw new Error("Failed to send Telegram message");
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    throw error;
  }
};
