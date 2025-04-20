
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

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
    const { query_embedding, similarity_threshold = 0.7, match_count = 5 } = await req.json();

    // Query content items with metadata containing embeddings
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');

    const response = await fetch(`${supabaseUrl}/rest/v1/analytics`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      // Find items with embeddings where event_type is 'embedding_created'
      // This is a simplified approach since we don't have pgvector
    });

    const items = await response.json();
    
    // Filter for items with embeddings
    const itemsWithEmbeddings = items.filter(item => 
      item.event_type === 'embedding_created' && 
      item.metadata?.embedding
    );

    // Calculate similarity (cosine similarity) manually
    // This is not efficient but works for demo without pgvector
    const calculateCosineSimilarity = (vecA, vecB) => {
      let dotProduct = 0;
      let normA = 0;
      let normB = 0;
      
      for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
      }
      
      return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    };

    // Calculate similarity for each item
    const itemsWithSimilarity = itemsWithEmbeddings.map(item => {
      const similarity = calculateCosineSimilarity(
        query_embedding, 
        item.metadata.embedding
      );
      
      return {
        id: item.content_item_id,
        similarity,
        title: item.metadata.title || 'Untitled',
        content: item.metadata.text || ''
      };
    });

    // Filter by threshold and sort by similarity
    const result = itemsWithSimilarity
      .filter(item => item.similarity > similarity_threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, match_count);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error finding similar resources:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
