ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS instructor text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS price numeric(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_modules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_resources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_embeddings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_history TO authenticated;
GRANT ALL ON public.courses, public.course_modules, public.course_resources, public.resource_embeddings, public.chat_history TO service_role;

DROP INDEX IF EXISTS public.resource_embeddings_embedding_idx;
ALTER TABLE public.resource_embeddings ALTER COLUMN embedding TYPE vector(3072);
CREATE INDEX resource_embeddings_embedding_idx
  ON public.resource_embeddings
  USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);

CREATE OR REPLACE FUNCTION private.match_course_resources(
  query_embedding vector(3072),
  requested_course_id uuid DEFAULT NULL,
  match_count integer DEFAULT 5
)
RETURNS TABLE (
  resource_id uuid,
  module_id uuid,
  course_id uuid,
  title text,
  content text,
  resource_type text,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT r.id, r.module_id, m.course_id, r.title, r.content, r.resource_type,
    1 - (e.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)) AS similarity
  FROM public.resource_embeddings e
  JOIN public.course_resources r ON r.id = e.resource_id
  JOIN public.course_modules m ON m.id = r.module_id
  JOIN public.courses c ON c.id = m.course_id
  WHERE (requested_course_id IS NULL OR m.course_id = requested_course_id)
    AND (c.is_published OR c.created_by = auth.uid() OR private.has_role(auth.uid(), 'admin'))
  ORDER BY e.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
  LIMIT LEAST(GREATEST(match_count, 1), 10)
$$;

REVOKE ALL ON FUNCTION private.match_course_resources(vector, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.match_course_resources(vector, uuid, integer) TO authenticated, service_role;