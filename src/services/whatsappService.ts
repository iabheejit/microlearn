import { WhatsAppTemplate } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";

// Helper function to extract variables from template content
const extractVariables = (content: string): string[] => {
  const regex = /\{\{(\d+)\}\}/g;
  const variables: string[] = [];
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    variables.push(match[1]);
  }
  
  return variables;
};

export const fetchWhatsAppTemplates = async (): Promise<WhatsAppTemplate[]> => {
  try {
    console.log("Fetching WhatsApp templates from Supabase...");
    
    // First, try to get templates from Supabase
    const { data: localTemplates, error: localError } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .order('name');
    
    // If we have templates in Supabase and no error, return them
    if (localTemplates?.length && !localError) {
      console.log(`Found ${localTemplates.length} templates in Supabase.`);
      return localTemplates.map((template: any) => ({
        id: template.wati_id,
        name: template.name,
        content: template.content,
        variables: template.variables || [],
        status: template.status
      }));
    }
    
    console.log("No templates found in Supabase or error occurred. Syncing from API...");
    
    // Otherwise, fetch from WATI API
    return await syncWhatsAppTemplates();
  } catch (error) {
    console.error("Error fetching WhatsApp templates:", error);
    throw error;
  }
};

export const syncWhatsAppTemplates = async (): Promise<WhatsAppTemplate[]> => {
  try {
    console.log("Starting WhatsApp templates sync...");
    
    // Force fetch from WATI API
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: { endpoint: "getTemplates" }
    });

    if (error) {
      console.error("Error syncing WhatsApp templates:", error);
      throw error;
    }
    
    if (!data || !data.templates || !Array.isArray(data.templates)) {
      console.error("Invalid response from WhatsApp API:", data);
      throw new Error("Invalid response format from WhatsApp API");
    }
    
    console.log(`Received ${data.templates.length} templates from WATI API`);
    
    // Transform WATI templates to our app's template format
    const templates = data.templates.map((template: any) => {
      const variables = extractVariables(template.content);
      const status = template.status?.toLowerCase() === "approved" ? "approved" : 
                     template.status?.toLowerCase() === "rejected" ? "rejected" : "pending";
      
      return {
        id: template.id,
        name: template.elementName,
        content: template.content,
        variables,
        status
      };
    });
    
    console.log(`Processed ${templates.length} templates`);
    
    // Store the templates in Supabase
    if (templates.length > 0) {
      // First delete all existing templates
      const { error: deleteError } = await supabase
        .from('whatsapp_templates')
        .delete()
        .gt('id', '0');
      
      if (deleteError) {
        console.error("Error deleting existing templates:", deleteError);
      } else {
        console.log("Successfully deleted existing templates");
      }
      
      // Then insert the fresh ones
      const { error: insertError } = await supabase
        .from('whatsapp_templates')
        .insert(
          templates.map(t => ({
            wati_id: t.id,
            name: t.name, 
            content: t.content,
            variables: t.variables,
            status: t.status
          }))
        );
      
      if (insertError) {
        console.error("Error storing templates in Supabase:", insertError);
      } else {
        console.log(`Successfully stored ${templates.length} templates in Supabase`);
      }
    }
    
    return templates;
  } catch (error) {
    console.error("Error syncing WhatsApp templates:", error);
    throw error;
  }
};

export const fetchContacts = async (): Promise<any[]> => {
  try {
    console.log("Fetching WhatsApp contacts from Supabase...");
    
    // First, try to get contacts from Supabase
    const { data: localContacts, error: localError } = await supabase
      .from('whatsapp_contacts')
      .select('*');
    
    // If we have contacts in Supabase and no error, return them
    if (localContacts?.length && !localError) {
      console.log(`Found ${localContacts.length} contacts in Supabase.`);
      return localContacts;
    }
    
    console.log("No contacts found in Supabase or error occurred. Syncing from API...");
    
    // Otherwise, fetch from WATI API
    return await syncWhatsAppContacts();
  } catch (error) {
    console.error("Error fetching contacts:", error);
    throw error;
  }
};

export const syncWhatsAppContacts = async (): Promise<any[]> => {
  try {
    console.log("Starting WhatsApp contacts sync...");
    
    // Force fetch from WATI API
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: { endpoint: "getContacts" }
    });

    if (error) {
      console.error("Error syncing contacts:", error);
      throw error;
    }

    if (!data || !data.contacts || !Array.isArray(data.contacts)) {
      console.error("Invalid response from WhatsApp API:", data);
      throw new Error("Invalid response format from WhatsApp API for contacts");
    }
    
    console.log(`Received ${data.contacts.length} contacts from WATI API`);
    
    const contacts = data.contacts || [];
    
    // Store the contacts in Supabase
    if (contacts.length > 0) {
      // First delete all existing contacts
      const { error: deleteError } = await supabase
        .from('whatsapp_contacts')
        .delete()
        .gt('id', '0');
      
      if (deleteError) {
        console.error("Error deleting existing contacts:", deleteError);
      } else {
        console.log("Successfully deleted existing contacts");
      }
      
      // Then insert the fresh ones
      const { error: insertError } = await supabase
        .from('whatsapp_contacts')
        .insert(
          contacts.map((contact: any) => ({
            wati_id: contact.id || null, 
            phone_number: contact.phoneNumber || contact.phone_number,
            name: contact.name || null
          }))
        );
      
      if (insertError) {
        console.error("Error storing contacts in Supabase:", insertError);
      } else {
        console.log(`Successfully stored ${contacts.length} contacts in Supabase`);
      }
    }

    return contacts;
  } catch (error) {
    console.error("Error syncing contacts:", error);
    throw error;
  }
};

export const sendTestMessage = async (
  phoneNumber: string, 
  templateName: string, 
  parameters: string[]
): Promise<any> => {
  try {
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: { 
        endpoint: "sendMessage",
        phoneNumber, 
        templateName, 
        parameters 
      }
    });

    if (error) {
      console.error("Error sending test message:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("Error sending test message:", error);
    throw error;
  }
};

export const fetchWhatsAppMessages = async (phoneNumber: string): Promise<any[]> => {
  try {
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: { 
        endpoint: "getMessages", 
        phoneNumber 
      }
    });

    if (error) {
      console.error("Error fetching WhatsApp messages:", error);
      throw error;
    }

    return data.messages || [];
  } catch (error) {
    console.error("Error fetching WhatsApp messages:", error);
    throw error;
  }
};

export const fetchWhatsAppAnalytics = async (
  startDate?: string,
  endDate?: string
): Promise<any> => {
  try {
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: { 
        endpoint: "getAnalytics", 
        startDate, 
        endDate 
      }
    });

    if (error) {
      console.error("Error fetching WhatsApp analytics:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("Error fetching WhatsApp analytics:", error);
    throw error;
  }
};
