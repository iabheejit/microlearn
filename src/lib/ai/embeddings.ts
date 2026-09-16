
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
    if (!resource.course_id) {
      throw new Error('A course is required to store this resource');
    }

    const { data: module, error: moduleError } = await supabase
      .from('course_modules')
      .select('id')
      .eq('course_id', resource.course_id)
      .order('order_index', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (moduleError) throw moduleError;
    if (!module) throw new Error('Create a course module before adding resources');

    const { data: contentItem, error: contentError } = await supabase
      .from('course_resources')
      .insert({
        title: resource.title,
        content: resource.content,
        resource_type: resource.type,
        module_id: module.id,
        order_index: 1
      })
      .select()
      .single();

    if (contentError) throw contentError;

    // Generate embedding for the content using our edge function
    const embedding = await generateEmbedding(resource.content);

    const embeddingValue = Array.isArray(embedding) ? `[${embedding.join(',')}]` : String(embedding);
    const { error: embeddingError } = await supabase
      .from('resource_embeddings')
      .insert({
        resource_id: contentItem.id,
        embedding: embeddingValue
      });

    if (embeddingError) throw embeddingError;

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
