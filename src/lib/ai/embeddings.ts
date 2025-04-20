
import { supabase } from "@/integrations/supabase/client";

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

export async function generateEmbedding(text: string) {
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

export async function storeResourceWithEmbedding(
  resource: {
    title: string, 
    description: string, 
    content: string, 
    type: string, 
    tags: string[], 
    course_id?: string
  }
) {
  try {
    // First, insert the resource
    const { data: resourceData, error: resourceError } = await supabase
      .from('resources')
      .insert(resource)
      .select()
      .single();

    if (resourceError) throw resourceError;

    // Generate embedding for the content
    const embedding = await generateEmbedding(resource.content);

    // Store the embedding
    const { error: embeddingError } = await supabase
      .from('vector_embeddings')
      .insert({
        resource_id: resourceData.id,
        content: resource.content,
        embedding: embedding,
        metadata: { 
          title: resource.title, 
          type: resource.type 
        }
      });

    if (embeddingError) throw embeddingError;

    return resourceData;
  } catch (error) {
    console.error('Error storing resource with embedding:', error);
    throw error;
  }
}

export async function findRelevantResources(query: string, limit: number = 5) {
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    // Perform vector similarity search
    const { data, error } = await supabase.rpc('find_similar_resources', {
      query_embedding: queryEmbedding,
      similarity_threshold: 0.7,
      match_count: limit
    });

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Error finding relevant resources:', error);
    throw error;
  }
}
