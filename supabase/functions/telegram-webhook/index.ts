
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only respond to POST requests
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
