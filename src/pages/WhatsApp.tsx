
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/dashboard/Sidebar";
import WhatsAppIntegration from "@/components/dashboard/WhatsAppIntegration";
import { fetchWhatsAppTemplates, fetchContacts } from "@/services/whatsappService";
import { Loader2 } from "lucide-react";

const WhatsApp = () => {
  const [isConfigured] = useState(true); // We assume the API is already configured with the token

  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ['whatsapp-templates'],
    queryFn: fetchWhatsAppTemplates,
    enabled: isConfigured
  });

  const { data: contacts, isLoading: contactsLoading } = useQuery({
    queryKey: ['whatsapp-contacts'],
    queryFn: fetchContacts,
    enabled: isConfigured
  });

  const isLoading = templatesLoading || contactsLoading;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto py-6 px-4 md:px-6">
          <header className="mb-6">
            <h1 className="text-2xl font-bold">WhatsApp Integration</h1>
            <p className="text-muted-foreground">
              Manage your WhatsApp Business API integration and message templates
            </p>
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
