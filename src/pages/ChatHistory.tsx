
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/dashboard/Sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const ChatHistory = () => {
  const [selectedPlatform, setSelectedPlatform] = useState<"all" | "whatsapp" | "telegram">("all");
  const [searchQuery, setSearchQuery] = useState("");

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

            <TabsContent value="all" className="space-y-4">
              {filteredChats().map((chat) => (
                <Card key={chat.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">
                        {chat.phone_number || chat.chat_id}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Last active: {new Date(chat.last_interaction_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Platform: {chat.phone_number ? 'WhatsApp' : 'Telegram'}
                    </div>
                  </div>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="whatsapp" className="space-y-4">
              {(whatsappChats || []).map((chat) => (
                <Card key={chat.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">{chat.phone_number}</h3>
                      <p className="text-sm text-muted-foreground">
                        Last active: {new Date(chat.last_interaction_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="telegram" className="space-y-4">
              {(telegramChats || []).map((chat) => (
                <Card key={chat.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">{chat.chat_id}</h3>
                      <p className="text-sm text-muted-foreground">
                        Last active: {new Date(chat.last_interaction_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default ChatHistory;
