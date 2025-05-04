
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BASE_URL = "https://live-mt-server.wati.io/8076";
const ACCESS_TOKEN = Deno.env.get("WHATSAPP_API_KEY");

interface WatiTemplate {
  id: number;
  elementName: string;
  status: string;
  category: string;
  languageCode: string;
  content: string;
}

interface MessageParams {
  phoneNumber: string;
  templateName: string;
  parameters: string[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const endpoint = url.pathname.split('/').pop();

    // Check authentication
    const authorization = req.headers.get('Authorization');
    if (!authorization) {
      return new Response(JSON.stringify({ error: 'Unauthorized request' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!ACCESS_TOKEN) {
      console.error('WHATSAPP_API_KEY environment variable is not set');
      return new Response(JSON.stringify({ error: 'WhatsApp API not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Handle different endpoints
    switch (endpoint) {
      case 'getTemplates': {
        const response = await fetch(`${BASE_URL}/api/v1/getMessageTemplates`, {
          headers: {
            'Authorization': ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Error fetching templates:', errorText);
          return new Response(JSON.stringify({ error: `API error: ${response.status}` }), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'getContacts': {
        const response = await fetch(`${BASE_URL}/api/v1/getContacts`, {
          headers: {
            'Authorization': ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Error fetching contacts:', errorText);
          return new Response(JSON.stringify({ error: `API error: ${response.status}` }), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'sendMessage': {
        if (req.method !== 'POST') {
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { phoneNumber, templateName, parameters } = await req.json() as MessageParams;

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
          const errorText = await response.text();
          console.error('Error sending message:', errorText);
          return new Response(JSON.stringify({ error: `API error: ${response.status}` }), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
