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

interface RequestBody {
  endpoint: string;
  phoneNumber?: string;
  templateName?: string;
  parameters?: string[];
  startDate?: string;
  endDate?: string;
}

serve(async (req) => {
  console.log(`WhatsApp API request received: ${req.method} ${req.url}`);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log("Handling CORS preflight request");
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check authentication
    const authorization = req.headers.get('Authorization');
    if (!authorization) {
      console.error("Unauthorized request: Missing Authorization header");
      return new Response(JSON.stringify({ error: 'Unauthorized request' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!ACCESS_TOKEN) {
      console.error('WHATSAPP_API_KEY environment variable is not set');
      return new Response(JSON.stringify({ error: 'WhatsApp API not configured: Missing API key' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let requestBody: RequestBody;
    try {
      requestBody = await req.json();
    } catch (e) {
      console.error("Error parsing request body:", e);
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const { endpoint } = requestBody;
    console.log(`Processing endpoint: ${endpoint}`);

    // Handle different endpoints
    switch (endpoint) {
      case 'getTemplates': {
        console.log("Fetching templates from WATI API");
        const response = await fetch(`${BASE_URL}/api/v1/getMessageTemplates`, {
          headers: {
            'Authorization': ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        });

        const responseText = await response.text();
        console.log(`WATI API templates response status: ${response.status}`);
        
        if (!response.ok) {
          console.error('Error fetching templates:', responseText);
          return new Response(JSON.stringify({ 
            error: `API error: ${response.status}`, 
            details: responseText 
          }), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        let data;
        try {
          data = JSON.parse(responseText);
          console.log(`Successfully parsed templates response. Found ${data.templates?.length || 0} templates`);
        } catch (e) {
          console.error("Error parsing templates response:", e, "Response text:", responseText);
          return new Response(JSON.stringify({ 
            error: 'Invalid JSON response from WATI API', 
            details: responseText.substring(0, 200) + (responseText.length > 200 ? '...' : '')
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'getContacts': {
        console.log("Fetching contacts from WATI API");
        const response = await fetch(`${BASE_URL}/api/v1/getContacts`, {
          headers: {
            'Authorization': ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        });

        const responseText = await response.text();
        console.log(`WATI API contacts response status: ${response.status}`);
        
        if (!response.ok) {
          console.error('Error fetching contacts:', responseText);
          return new Response(JSON.stringify({ 
            error: `API error: ${response.status}`, 
            details: responseText 
          }), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        let data;
        try {
          data = JSON.parse(responseText);
          console.log(`Successfully parsed contacts response. Found ${data.contacts?.length || 0} contacts`);
        } catch (e) {
          console.error("Error parsing contacts response:", e, "Response text:", responseText);
          return new Response(JSON.stringify({ 
            error: 'Invalid JSON response from WATI API', 
            details: responseText.substring(0, 200) + (responseText.length > 200 ? '...' : '')
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'sendMessage': {
        const { phoneNumber, templateName, parameters } = requestBody;

        if (!phoneNumber || !templateName || !parameters) {
          return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

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

      case 'getAnalytics': {
        const { startDate, endDate } = requestBody;
        
        // Format dates for API call
        const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Default 30 days ago
        const end = endDate || new Date().toISOString().split('T')[0]; // Default today
        
        // Fetch message statistics
        const messagesResponse = await fetch(`${BASE_URL}/api/v1/getMessageStatistics?startDate=${start}&endDate=${end}`, {
          headers: {
            'Authorization': ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        });

        if (!messagesResponse.ok) {
          const errorText = await messagesResponse.text();
          console.error('Error fetching message statistics:', errorText);
          return new Response(JSON.stringify({ error: `API error: ${messagesResponse.status}` }), {
            status: messagesResponse.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        const messagesData = await messagesResponse.json();
        
        // Fetch conversation analytics
        const conversationsResponse = await fetch(`${BASE_URL}/api/v1/getConversationStatistics?startDate=${start}&endDate=${end}`, {
          headers: {
            'Authorization': ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        });

        if (!conversationsResponse.ok) {
          const errorText = await conversationsResponse.text();
          console.error('Error fetching conversation statistics:', errorText);
        }
        
        const conversationsData = await conversationsResponse.json().catch(() => ({}));
        
        // Combine data for a comprehensive analytics response
        const analyticsData = {
          messages: messagesData,
          conversations: conversationsData
        };

        return new Response(JSON.stringify(analyticsData), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'getMessages': {
        const { phoneNumber } = requestBody;
        
        if (!phoneNumber) {
          return new Response(JSON.stringify({ error: 'Phone number is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        const response = await fetch(`${BASE_URL}/api/v1/getMessages/${phoneNumber}`, {
          headers: {
            'Authorization': ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Error fetching messages:', errorText);
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
        console.error(`Endpoint not found: ${endpoint}`);
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
