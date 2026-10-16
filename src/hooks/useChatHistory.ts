
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchTelegramUpdates, sendTelegramMessage } from '@/services/telegramService';
import { supabase } from '@/integrations/supabase/client';
import { WhatsAppReplyWindowClosedError } from '@/lib/whatsapp-reply-window';
import { useServerFn } from '@tanstack/react-start';
import { sendPortalReply } from '@/lib/whatsapp-send.functions';

// For WhatsApp chats
export const useWhatsAppChat = (phoneNumber?: string) => {
  const sendReply = useServerFn(sendPortalReply);
  const normalizedPhone = phoneNumber?.replace(/\D/g, '');
  
  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ['whatsapp-messages', normalizedPhone],
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
    if (!phoneNumber) return;
    const normalized = phoneNumber.replace(/\D/g, '');
    const channel = supabase
      .channel(`whatsapp-chat-${normalized}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'whatsapp_messages',
        filter: `phone_number=eq.${normalized}`,
      }, () => {
        void refetch();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [phoneNumber, refetch]);
  
  const sendMessage = async (content: string) => {
    if (!phoneNumber) throw new Error('Phone number is required to send a reply');
    const response = await sendReply({ data: { phoneNumber, message: content } });
    if (!response.ok) {
      await refetch();
      if (response.code === 'WINDOW_CLOSED') throw new WhatsAppReplyWindowClosedError();
      throw new Error(response.error);
    }
    await refetch();
    return response;
  };
  
  return {
    messages: data ?? [],
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
