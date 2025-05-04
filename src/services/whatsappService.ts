
import { WhatsAppTemplate } from "@/lib/types";

const BASE_URL = "https://live-mt-server.wati.io/8076";
const ACCESS_TOKEN = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..ZLcKN4VGEk0rXWTUExiuxi8hTMxTcqNBlfhyqwO4X-M";

interface WatiTemplate {
  id: number;
  elementName: string;
  status: string;
  category: string;
  languageCode: string;
  content: string;
}

export const fetchWhatsAppTemplates = async (): Promise<WhatsAppTemplate[]> => {
  try {
    const response = await fetch(`${BASE_URL}/api/v1/getMessageTemplates`, {
      headers: {
        'Authorization': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Transform WATI templates to our app's template format
    return data.templates.map((template: WatiTemplate) => ({
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
    const response = await fetch(`${BASE_URL}/api/v1/sendTemplateMessage`, {
      method: 'POST',
      headers: {
        'Authorization': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        template_name: templateName,
        broadcast_name: "Test Message",
        parameters: parameters.map(param => ({ name: "default", value: param })),
        phone: phoneNumber
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error sending test message:", error);
    throw error;
  }
};

export const fetchContacts = async (): Promise<any[]> => {
  try {
    const response = await fetch(`${BASE_URL}/api/v1/getContacts`, {
      headers: {
        'Authorization': ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.contacts || [];
  } catch (error) {
    console.error("Error fetching contacts:", error);
    throw error;
  }
};

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
