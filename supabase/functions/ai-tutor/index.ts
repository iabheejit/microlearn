
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

    // Find relevant resources using our find-similar-resources function
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    // First generate embeddings for the query
    const embeddingResponse = await fetch(`${supabaseUrl}/functions/v1/generate-embedding`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: query
      })
    });
    
    if (!embeddingResponse.ok) {
      throw new Error(`Failed to generate embedding: ${embeddingResponse.statusText}`);
    }
    
    const embeddingData = await embeddingResponse.json();
    
    // Then find similar resources
    const resourceResponse = await fetch(`${supabaseUrl}/functions/v1/find-similar-resources`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query_embedding: embeddingData.embedding,
        similarity_threshold: 0.7,
        match_count: 5
      })
    });
    
    if (!resourceResponse.ok) {
      throw new Error(`Failed to find resources: ${resourceResponse.statusText}`);
    }
    
    const relevantResources = await resourceResponse.json();

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
    
    if (!data.choices || !data.choices[0]) {
      throw new Error('Invalid response from OpenAI');
    }
    
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
