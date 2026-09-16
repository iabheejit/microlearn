
import { supabase } from "@/integrations/supabase/client";

export const fetchTelegramAnalytics = async (): Promise<any> => {
  try {
    const [{ count: contacts, error: contactsError }, { data: messages, error: messagesError }] = await Promise.all([
      supabase.from('telegram_contacts').select('*', { count: 'exact', head: true }),
      supabase.from('telegram_messages').select('direction,sent_at'),
    ]);
    if (contactsError) throw contactsError;
    if (messagesError) throw messagesError;
    const incoming = messages.filter((message) => message.direction === 'incoming').length;
    return { totalUpdates: messages.length, uniqueUsers: contacts || 0, incoming, outgoing: messages.length - incoming };
  } catch (error) {
    console.error("Error fetching Telegram analytics:", error);
    throw error;
  }
};

export const fetchTelegramUpdates = async (): Promise<any[]> => {
  try {
    const { data, error } = await supabase.from('telegram_messages').select('*').order('sent_at', { ascending: true }).limit(200);
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching Telegram updates:", error);
    throw error;
  }
};

export const sendTelegramMessage = async (chatId: string, text: string): Promise<any> => {
  try {
    const { data, error } = await supabase.functions.invoke('telegram-webhook', { body: { endpoint: 'sendMessage', chatId, text } });
    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    throw error;
  }
};
