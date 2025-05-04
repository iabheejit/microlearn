
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/dashboard/Sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, MessageSquare, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWhatsAppChat, useTelegramChat } from "@/hooks/useChatHistory";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";

const ChatHistory = () => {
  const { toast } = useToast();
  const [selectedPlatform, setSelectedPlatform] = useState<"all" | "whatsapp" | "telegram">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [newMessage, setNewMessage] = useState("");

  // WhatsApp chat hook
  const {
    messages: whatsappMessages,
    isLoading: loadingWhatsappMessages,
    sendMessage: sendWhatsAppMessage,
    refetch: refetchWhatsAppMessages
  } = useWhatsAppChat(selectedChat?.phone_number);

  // Telegram chat hook
  const {
    updates: telegramUpdates,
    isLoading: loadingTelegramMessages,
    sendMessage: sendTelegramMessage,
    refetch: refetchTelegramMessages
  } = useTelegramChat(selectedChat?.chat_id?.toString());

  const { data: whatsappChats, isLoading: loadingWhatsapp } = useQuery({
    queryKey: ['whatsapp-chats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_metadata')
        .select(`
          *,
          user_progress: user_progress(*)
        `)
        .order('last_interaction_at', { ascending: false });

      if (error) throw error;
      return data;
    }
  });

  const { data: telegramChats, isLoading: loadingTelegram } = useQuery({
    queryKey: ['telegram-chats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('telegram_metadata')
        .select(`
          *,
          user_progress: user_progress(*)
        `)
        .order('last_interaction_at', { ascending: false });

      if (error) throw error;
      return data;
    }
  });

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedChat) return;

    try {
      if (selectedChat.phone_number) {
        // Send WhatsApp message
        await sendWhatsAppMessage(newMessage);
        toast({
          title: "Message sent",
          description: "Your WhatsApp message has been sent"
        });
      } else if (selectedChat.chat_id) {
        // Send Telegram message
        await sendTelegramMessage(newMessage);
        toast({
          title: "Message sent",
          description: "Your Telegram message has been sent"
        });
      }
      
      setNewMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Error sending message",
        description: "There was a problem sending your message",
        variant: "destructive"
      });
    }
  };

  const handleOpenChat = (chat: any) => {
    setSelectedChat(chat);
    setChatModalOpen(true);
    
    // Refresh messages/updates when opening a chat
    if (chat.phone_number) {
      refetchWhatsAppMessages();
    } else if (chat.chat_id) {
      refetchTelegramMessages();
    }
  };

  const filteredChats = () => {
    let chats = [];
    
    if (selectedPlatform === "all" || selectedPlatform === "whatsapp") {
      chats.push(...(whatsappChats || []));
    }
    
    if (selectedPlatform === "all" || selectedPlatform === "telegram") {
      chats.push(...(telegramChats || []));
    }
    
    if (searchQuery) {
      chats = chats.filter(chat => 
        chat.phone_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        chat.chat_id?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    return chats;
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto py-6 px-4 md:px-6">
          <header className="mb-6">
            <h1 className="text-2xl font-bold">Chat History</h1>
            <p className="text-muted-foreground">
              View and manage student conversations across platforms
            </p>
          </header>

          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <Tabs defaultValue="all" onValueChange={(value) => setSelectedPlatform(value as any)}>
            <TabsList>
              <TabsTrigger value="all">All Platforms</TabsTrigger>
              <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
              <TabsTrigger value="telegram">Telegram</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4 mt-4">
              {filteredChats().map((chat) => (
                <Card key={chat.id} className="p-4 hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => handleOpenChat(chat)}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium flex items-center gap-2">
                        {chat.phone_number || chat.chat_id}
                        <Badge variant="outline" className="ml-2">
                          {chat.phone_number ? 'WhatsApp' : 'Telegram'}
                        </Badge>
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Last active: {new Date(chat.last_interaction_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon">
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
              
              {filteredChats().length === 0 && !loadingWhatsapp && !loadingTelegram && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No conversations found</p>
                </div>
              )}
              
              {(loadingWhatsapp || loadingTelegram) && (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}
            </TabsContent>

            <TabsContent value="whatsapp" className="space-y-4 mt-4">
              {(whatsappChats || [])
                .filter(chat => !searchQuery || chat.phone_number?.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((chat) => (
                <Card key={chat.id} className="p-4 hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => handleOpenChat(chat)}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">{chat.phone_number}</h3>
                      <p className="text-sm text-muted-foreground">
                        Last active: {new Date(chat.last_interaction_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon">
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
              
              {whatsappChats?.length === 0 && !loadingWhatsapp && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No WhatsApp conversations found</p>
                </div>
              )}
              
              {loadingWhatsapp && (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}
            </TabsContent>

            <TabsContent value="telegram" className="space-y-4 mt-4">
              {(telegramChats || [])
                .filter(chat => !searchQuery || chat.chat_id?.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((chat) => (
                <Card key={chat.id} className="p-4 hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => handleOpenChat(chat)}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">{chat.chat_id}</h3>
                      <p className="text-sm text-muted-foreground">
                        Last active: {new Date(chat.last_interaction_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon">
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
              
              {telegramChats?.length === 0 && !loadingTelegram && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No Telegram conversations found</p>
                </div>
              )}
              
              {loadingTelegram && (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Chat Dialog */}
      <Dialog open={chatModalOpen} onOpenChange={setChatModalOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedChat?.phone_number || selectedChat?.chat_id}
              <Badge variant="outline">
                {selectedChat?.phone_number ? 'WhatsApp' : 'Telegram'}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto my-4 p-3 bg-muted/50 rounded-md min-h-[300px] max-h-[400px]">
            {selectedChat?.phone_number ? (
              // WhatsApp Messages
              loadingWhatsappMessages ? (
                <div className="flex justify-center items-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : whatsappMessages.length > 0 ? (
                whatsappMessages.map((msg, idx) => (
                  <div 
                    key={idx}
                    className={`mb-2 p-2 rounded-lg ${
                      msg.sent ? 'ml-auto bg-primary/10' : 'mr-auto bg-secondary/10'
                    } max-w-[80%]`}
                  >
                    <p className="text-sm">{msg.content}</p>
                    <span className="text-xs text-muted-foreground">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground">No messages to display</p>
              )
            ) : (
              // Telegram Updates
              loadingTelegramMessages ? (
                <div className="flex justify-center items-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : telegramUpdates.length > 0 ? (
                telegramUpdates
                  .filter((update) => update.message)
                  .map((update, idx) => (
                    <div 
                      key={idx}
                      className={`mb-2 p-2 rounded-lg ${
                        update.message.from.is_bot ? 'ml-auto bg-primary/10' : 'mr-auto bg-secondary/10'
                      } max-w-[80%]`}
                    >
                      <p className="text-sm">{update.message.text}</p>
                      <span className="text-xs text-muted-foreground">
                        {new Date(update.message.date * 1000).toLocaleTimeString()}
                      </span>
                    </div>
                  ))
              ) : (
                <p className="text-center text-muted-foreground">No messages to display</p>
              )
            )}
          </div>
          
          <div className="flex gap-2">
            <Textarea 
              placeholder="Type your message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            <Button onClick={handleSendMessage} type="submit">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatHistory;
