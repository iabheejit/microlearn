
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Telegram Bot token should be set in Supabase secrets
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
      first_name: string;
      username?: string;
    };
    date: number;
    text?: string;
  };
}

// Store recent updates for real-time functionality
// This is a simple in-memory store that will be lost on function restarts
// In a production environment, consider using a database
const recentUpdates: TelegramUpdate[] = [];
const maxUpdates = 100;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();
    
    // Get recent updates endpoint
    if (path === 'getUpdates' && req.method === 'GET') {
      // This endpoint allows the frontend to get recent updates without polling the Telegram API
      return new Response(JSON.stringify({ updates: recentUpdates }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Get analytics endpoint
    if (path === 'getAnalytics' && req.method === 'GET') {
      if (!TELEGRAM_BOT_TOKEN) {
        return new Response(JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN environment variable is not set' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Fetch updates from Telegram API for analytics
      const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          offset: -100,  // Get last 100 updates
          limit: 100
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error fetching updates from Telegram:', errorData);
        return new Response(JSON.stringify({ error: 'Failed to fetch updates from Telegram' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      const data = await response.json();
      
      // Process updates to get analytics
      const updates = data.result || [];
      const uniqueUsers = new Set();
      const messagesByDate: Record<string, number> = {};
      
      updates.forEach((update: any) => {
        if (update.message) {
          // Count unique users
          uniqueUsers.add(update.message.from.id);
          
          // Group messages by date
          const date = new Date(update.message.date * 1000).toISOString().split('T')[0];
          messagesByDate[date] = (messagesByDate[date] || 0) + 1;
        }
      });
      
      const analytics = {
        totalUpdates: updates.length,
        uniqueUsers: Array.from(uniqueUsers).length,
        messagesByDate
      };
      
      return new Response(JSON.stringify({ analytics }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Send message endpoint
    if (path === 'sendMessage' && req.method === 'POST') {
      if (!TELEGRAM_BOT_TOKEN) {
        return new Response(JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN environment variable is not set' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Get parameters from request body
      const { chatId, text } = await req.json();
      
      if (!chatId || !text) {
        return new Response(JSON.stringify({ error: 'Missing required parameters: chatId and text' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Send message to Telegram
      const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: chatId,
          text
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error sending message to Telegram:', errorData);
        return new Response(JSON.stringify({ error: 'Failed to send message to Telegram' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      const data = await response.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Only respond to POST requests for the webhook itself
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify bot token is set
    if (!TELEGRAM_BOT_TOKEN) {
      console.error('TELEGRAM_BOT_TOKEN environment variable is not set');
      return new Response(JSON.stringify({ error: 'Configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse request body
    const telegramUpdate: TelegramUpdate = await req.json();
    console.log('Received update:', JSON.stringify(telegramUpdate));
    
    // Add to recent updates for real-time functionality
    recentUpdates.unshift(telegramUpdate);
    if (recentUpdates.length > maxUpdates) {
      recentUpdates.length = maxUpdates; // Keep only the most recent updates
    }

    // Check if it's a valid message
    if (!telegramUpdate.message || !telegramUpdate.message.text) {
      return new Response(JSON.stringify({ status: 'No message text found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { message } = telegramUpdate;
    const chatId = message.chat.id;
    const userId = message.from.id;
    const messageText = message.text;
    
    let responseText = '';
    
    // Basic command handling
    if (messageText.startsWith('/start')) {
      responseText = `Hello ${message.from.first_name}! I'm your AI tutor bot. Type /help to see what I can do.`;
    } else if (messageText.startsWith('/help')) {
      responseText = 'Available commands:\n' +
                     '/start - Start the bot\n' +
                     '/help - Show this help message\n' +
                     '/course - Show your course progress\n' +
                     '/lesson - Get today\'s lesson\n';
    } else {
      // For now, simply echo back the message
      // In a future implementation, this would connect to the AI tutor system
      responseText = `You said: ${messageText}\n\nIn the future, I'll be able to provide intelligent responses using AI!`;
    }

    // Send response back to user
    const telegramResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: responseText,
      }),
    });

    if (!telegramResponse.ok) {
      const errorData = await telegramResponse.json();
      console.error('Error sending message to Telegram:', errorData);
      return new Response(JSON.stringify({ error: 'Failed to send message to Telegram' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ status: 'Message sent successfully' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
