
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/dashboard/Sidebar";
import WhatsAppIntegration from "@/components/dashboard/WhatsAppIntegration";
import { 
  fetchWhatsAppTemplates, 
  fetchContacts, 
  syncWhatsAppTemplates,
  syncWhatsAppContacts 
} from "@/services/whatsappService";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

const WhatsApp = () => {
  const [isConfigured] = useState(true); // We assume the API is already configured with the token
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);

  const { 
    data: templates, 
    isLoading: templatesLoading,
    refetch: refetchTemplates 
  } = useQuery({
    queryKey: ['whatsapp-templates'],
    queryFn: fetchWhatsAppTemplates,
    enabled: isConfigured
  });

  const { 
    data: contacts, 
    isLoading: contactsLoading,
    refetch: refetchContacts 
  } = useQuery({
    queryKey: ['whatsapp-contacts'],
    queryFn: fetchContacts,
    enabled: isConfigured
  });

  const isLoading = templatesLoading || contactsLoading;

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await Promise.all([
        syncWhatsAppTemplates(),
        syncWhatsAppContacts()
      ]);
      
      await Promise.all([
        refetchTemplates(),
        refetchContacts()
      ]);
      
      toast({
        title: "Sync completed",
        description: "WhatsApp templates and contacts have been synced successfully."
      });
    } catch (error) {
      console.error("Error syncing WhatsApp data:", error);
      toast({
        title: "Sync failed",
        description: "Could not sync WhatsApp data. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto py-6 px-4 md:px-6">
          <header className="mb-6 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">WhatsApp Integration</h1>
              <p className="text-muted-foreground">
                Manage your WhatsApp Business API integration and message templates
              </p>
            </div>
            <Button 
              onClick={handleSync} 
              variant="outline" 
              disabled={isSyncing || isLoading}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Sync from WATI'}
            </Button>
          </header>

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Loading WhatsApp data...</span>
            </div>
          ) : (
            <WhatsAppIntegration 
              templates={templates || []}
              contacts={contacts || []}
              isConfigured={isConfigured}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default WhatsApp;
