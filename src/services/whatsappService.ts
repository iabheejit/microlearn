
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
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: {},
      method: "GET",
      path: "/getTemplates"
    });

    if (error) {
      console.error("Error fetching WhatsApp templates:", error);
      throw error;
    }
    
    // Transform WATI templates to our app's template format
    return data.templates.map((template: any) => ({
      id: template.id,
      name: template.elementName,
      content: template.content,
      variables: extractVariables(template.content),
      status: template.status.toLowerCase() === "approved" ? "approved" : 
              template.status.toLowerCase() === "rejected" ? "rejected" : "pending"
    }));
  } catch (error) {
    console.error("Error fetching WhatsApp templates:", error);
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
      body: { phoneNumber, templateName, parameters },
      method: "POST",
      path: "/sendMessage"
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

export const fetchContacts = async (): Promise<any[]> => {
  try {
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: {},
      method: "GET",
      path: "/getContacts"
    });

    if (error) {
      console.error("Error fetching contacts:", error);
      throw error;
    }

    return data.contacts || [];
  } catch (error) {
    console.error("Error fetching contacts:", error);
    throw error;
  }
};
