
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
import { Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const WhatsApp = () => {
  const [isConfigured] = useState(true); // We assume the API is already configured with the token
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const { 
    data: templates, 
    isLoading: templatesLoading,
    error: templatesError,
    refetch: refetchTemplates 
  } = useQuery({
    queryKey: ['whatsapp-templates'],
    queryFn: fetchWhatsAppTemplates,
    enabled: isConfigured,
    retry: 1
  });

  const { 
    data: contacts, 
    isLoading: contactsLoading,
    error: contactsError,
    refetch: refetchContacts 
  } = useQuery({
    queryKey: ['whatsapp-contacts'],
    queryFn: fetchContacts,
    enabled: isConfigured,
    retry: 1
  });

  const isLoading = templatesLoading || contactsLoading;
  const hasError = templatesError || contactsError || syncError;

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncError(null);
    
    try {
      console.log("Starting WhatsApp sync process...");
      
      // Perform syncs sequentially for better error handling
      // First sync templates
      console.log("Syncing templates...");
      await syncWhatsAppTemplates().catch(error => {
        console.error("Template sync failed:", error);
        throw new Error(`Failed to sync templates: ${error.message}`);
      });
      
      // Then sync contacts
      console.log("Syncing contacts...");
      await syncWhatsAppContacts().catch(error => {
        console.error("Contact sync failed:", error);
        throw new Error(`Failed to sync contacts: ${error.message}`);
      });
      
      // Refetch the data to update the UI
      console.log("Refetching data...");
      await Promise.all([
        refetchTemplates(),
        refetchContacts()
      ]);
      
      toast({
        title: "Sync completed",
        description: "WhatsApp templates and contacts have been synced successfully."
      });
    } catch (error) {
      const errorMsg = error instanceof Error 
        ? error.message 
        : "An unknown error occurred during sync";
      
      console.error("Error syncing WhatsApp data:", error);
      
      setSyncError(errorMsg);
      
      toast({
        title: "Sync failed",
        description: errorMsg,
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

          {syncError && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Sync Error</AlertTitle>
              <AlertDescription>
                {syncError}
              </AlertDescription>
            </Alert>
          )}

          {templatesError && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Templates Error</AlertTitle>
              <AlertDescription>
                {templatesError instanceof Error ? templatesError.message : "Failed to load templates"}
              </AlertDescription>
            </Alert>
          )}

          {contactsError && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Contacts Error</AlertTitle>
              <AlertDescription>
                {contactsError instanceof Error ? contactsError.message : "Failed to load contacts"}
              </AlertDescription>
            </Alert>
          )}

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
