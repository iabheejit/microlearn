
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, context = [], persona = 'helpful assistant' } = await req.json();

    // Find relevant resources
    const relevantResources = await findRelevantResources(query);

    // Prepare context with found resources
    const ragContext = relevantResources.map(
      (resource: any) => `Source: ${resource.title}\nContent: ${resource.content}`
    ).join('\n\n');

    // Prepare messages for OpenAI
    const messages = [
      { role: 'system', content: `You are a ${persona}. Use the following context to help answer the user's query:\n\n${ragContext}` },
      { role: 'user', content: query },
      ...context
    ];

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: messages,
        temperature: 0.7,
        max_tokens: 500
      }),
    });

    const data = await response.json();
    const generatedResponse = data.choices[0].message.content;

    return new Response(JSON.stringify({ 
      response: generatedResponse,
      sources: relevantResources 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in AI tutor function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function findRelevantResources(query: string, limit: number = 5) {
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    // Since this is an edge function, we'll use a direct fetch to Supabase
    const response = await fetch(`https://cvwylbvmrhcwktrtidvh.supabase.co/rest/v1/rpc/find_similar_resources`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': Deno.env.get('SUPABASE_ANON_KEY'),
      },
      body: JSON.stringify({
        query_embedding: queryEmbedding,
        similarity_threshold: 0.7,
        match_count: limit
      })
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error finding relevant resources:', error);
    throw error;
  }
}

async function generateEmbedding(text: string) {
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: text,
        model: 'text-embedding-003'
      })
    });

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}
