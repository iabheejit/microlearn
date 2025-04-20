
-- Create a function for finding similar resources using vector similarity
CREATE OR REPLACE FUNCTION public.find_similar_resources(
  query_embedding vector(1536),
  similarity_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.title,
    r.description,
    r.content,
    1 - (ve.embedding <=> query_embedding) AS similarity
  FROM public.resources r
  JOIN public.vector_embeddings ve ON r.id = ve.resource_id
  WHERE 1 - (ve.embedding <=> query_embedding) > similarity_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;
