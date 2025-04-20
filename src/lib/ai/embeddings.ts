
import { supabase } from "@/integrations/supabase/client";

// We need to use environment variables for the browser context
// This will be passed from the edge function
export async function generateEmbedding(text: string) {
  try {
    // We'll use the edge function to generate embeddings instead
    const { data, error } = await supabase.functions.invoke('generate-embedding', {
      body: { text }
    });

    if (error) throw error;
    return data.embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

// Store content in the content_items table which exists in the schema
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
    // First, insert the resource as a content item
    const { data: contentItem, error: contentError } = await supabase
      .from('content_items')
      .insert({
        title: resource.title,
        content: { 
          text: resource.content,
          description: resource.description,
          tags: resource.tags
        },
        content_type: 'text',
        module_id: resource.course_id || '00000000-0000-0000-0000-000000000000', // Default module if none provided
        sequence_order: 1
      })
      .select()
      .single();

    if (contentError) throw contentError;

    // Generate embedding for the content using our edge function
    const embedding = await generateEmbedding(resource.content);

    // Store metadata about the embedding in the analytics table
    const { error: analyticsError } = await supabase
      .from('analytics')
      .insert({
        content_item_id: contentItem.id,
        event_type: 'embedding_created',
        metadata: { 
          embedding: embedding,
          title: resource.title, 
          type: resource.type 
        }
      });

    if (analyticsError) throw analyticsError;

    return contentItem;
  } catch (error) {
    console.error('Error storing resource with embedding:', error);
    throw error;
  }
}

export async function findRelevantResources(query: string, limit: number = 5) {
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    // Use the function invoke method to call our vector search function
    const { data, error } = await supabase.functions.invoke('find-similar-resources', {
      body: { 
        query_embedding: queryEmbedding,
        similarity_threshold: 0.7,
        match_count: limit
      }
    });

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Error finding relevant resources:', error);
    throw error;
  }
}
