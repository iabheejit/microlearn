
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchTelegramUpdates, sendTelegramMessage } from '@/services/telegramService';
import { supabase } from '@/integrations/supabase/client';

// For WhatsApp chats
export const useWhatsAppChat = (phoneNumber?: string) => {
  const [messages, setMessages] = useState<any[]>([]);
  
  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ['whatsapp-messages', phoneNumber],
    queryFn: async () => {
      if (!phoneNumber) return [];
      const normalized = phoneNumber.replace(/\D/g, '');
      const { data: rows, error: queryError } = await supabase
        .from('whatsapp_messages')
        .select('id,content,direction,sent_at,status,provider_message_id,delivered_at,read_at,failed_at,status_error')
        .eq('phone_number', normalized)
        .order('sent_at', { ascending: true });
      if (queryError) throw queryError;
      return rows.map((message) => ({
        id: message.id,
        content: message.content,
        sent: message.direction === 'outgoing',
        timestamp: message.sent_at,
        status: message.status,
        providerMessageId: message.provider_message_id,
        deliveredAt: message.delivered_at,
        readAt: message.read_at,
        failedAt: message.failed_at,
        statusError: message.status_error,
      }));
    },
    enabled: !!phoneNumber,
    refetchInterval: 10000 // Polling every 10 seconds
  });
  
  useEffect(() => {
    if (data) {
      setMessages(data);
    }
  }, [data]);
  
  const sendMessage = async (content: string) => {
    if (!phoneNumber) throw new Error('Phone number is required to send a reply');
    const { data: response, error: sendError } = await supabase.functions.invoke('whatsapp-api', {
      body: { endpoint: 'sendReply', phoneNumber, message: content },
    });
    if (sendError) {
      const details = 'context' in sendError && sendError.context instanceof Response ? await sendError.context.text() : sendError.message;
      try {
        const parsed = JSON.parse(details);
        throw new Error(parsed.error || details);
      } catch (parseError) {
        if (parseError instanceof SyntaxError) throw new Error(details);
        throw parseError;
      }
    }
    await refetch();
    return response;
  };
  
  return {
    messages,
    isLoading,
    error,
    sendMessage,
    refetch
  };
};

// For Telegram chats
export const useTelegramChat = (chatId?: string) => {
  const [updates, setUpdates] = useState<any[]>([]);
  
  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ['telegram-updates'],
    queryFn: fetchTelegramUpdates,
    refetchInterval: 5000 // Polling every 5 seconds
  });
  
  useEffect(() => {
    if (data) {
      // Filter updates for this chat if chatId is provided
      const relevantUpdates = chatId
        ? data.filter((message: any) => message.chat_id === chatId)
        : data;
      
      setUpdates(relevantUpdates);
    }
  }, [data, chatId]);
  
  const sendMessage = async (content: string) => {
    if (!chatId) {
      throw new Error("Chat ID is required to send a message");
    }
    
    try {
      const result = await sendTelegramMessage(chatId, content);
      
      // Refresh to get the new message
      setTimeout(() => refetch(), 1000);
      
      return result;
    } catch (error) {
      console.error("Error sending Telegram message:", error);
      throw error;
    }
  };
  
  return {
    updates,
    isLoading,
    error,
    sendMessage,
    refetch
  };
};
