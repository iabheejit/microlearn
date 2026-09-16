
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchWhatsAppMessages } from '@/services/whatsappService';
import { fetchTelegramUpdates, sendTelegramMessage } from '@/services/telegramService';
import { sendTestMessage } from '@/services/whatsappService';

// For WhatsApp chats
export const useWhatsAppChat = (phoneNumber?: string) => {
  const [messages, setMessages] = useState<any[]>([]);
  
  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ['whatsapp-messages', phoneNumber],
    queryFn: () => phoneNumber ? fetchWhatsAppMessages(phoneNumber) : Promise.resolve([]),
    enabled: !!phoneNumber,
    refetchInterval: 10000 // Polling every 10 seconds
  });
  
  useEffect(() => {
    if (data) {
      setMessages(data);
    }
  }, [data]);
  
  const sendMessage = async (content: string) => {
    throw new Error('WhatsApp replies require an approved template. Send from WhatsApp Integration.');
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
