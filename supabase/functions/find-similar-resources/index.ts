import { z } from 'npm:zod';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireUser } from '../_shared/auth.ts';
import { errorResponse, jsonResponse, optionsResponse } from '../_shared/responses.ts';

const Schema = z.object({ query_embedding: z.array(z.number()).length(3072), course_id: z.string().uuid().nullable().optional(), similarity_threshold: z.number().min(-1).max(1).default(0.45), match_count: z.number().int().min(1).max(10).default(5) });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  try {
    const { client } = await requireUser(req);
    const parsed = Schema.safeParse(await req.json());
    if (!parsed.success) return jsonResponse({ error: parsed.error.flatten().fieldErrors }, 400);
    const { data, error } = await client.rpc('match_course_resources', {
      query_embedding: `[${parsed.data.query_embedding.join(',')}]`, requested_course_id: parsed.data.course_id || null, match_count: parsed.data.match_count,
    });
    if (error) throw error;
    return jsonResponse((data || []).filter((item: { similarity: number }) => item.similarity >= parsed.data.similarity_threshold));
  } catch (error) { return errorResponse(error); }
});
