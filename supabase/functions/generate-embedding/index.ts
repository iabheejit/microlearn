import { z } from 'npm:zod';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireUser } from '../_shared/auth.ts';
import { createEmbedding } from '../_shared/ai.ts';
import { errorResponse, jsonResponse, optionsResponse } from '../_shared/responses.ts';

const Schema = z.object({ text: z.string().trim().min(1).max(30000), resourceId: z.string().uuid().nullable().optional() });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  try {
    const { client, user } = await requireUser(req);
    const parsed = Schema.safeParse(await req.json());
    if (!parsed.success) return jsonResponse({ error: parsed.error.flatten().fieldErrors }, 400);
    const result = await createEmbedding(parsed.data.text, req);
    if (parsed.data.resourceId) {
      const { data: resource, error: resourceError } = await client
        .from('course_resources')
        .select('module_id, course_modules!inner(course_id, courses!inner(created_by))')
        .eq('id', parsed.data.resourceId)
        .maybeSingle();
      if (resourceError) throw resourceError;
      const creatorId = (resource as any)?.course_modules?.courses?.created_by;
      const { data: role } = await client.from('user_roles').select('role,status').eq('user_id', user.id).maybeSingle();
      if (!resource || (creatorId !== user.id && !(role?.status === 'active' && role.role === 'admin'))) {
        return jsonResponse({ error: 'You cannot update this course resource' }, 403);
      }
      const { error: saveError } = await client.from('resource_embeddings').upsert({ resource_id: parsed.data.resourceId, embedding: `[${result.embedding.join(',')}]` }, { onConflict: 'resource_id' });
      if (saveError) throw saveError;
    }
    return jsonResponse({ embedding: result.embedding, model: 'google/gemini-embedding-2' }, 200, {
      ...(result.headers.get('X-Lovable-AIG-Run-ID') ? { 'X-Lovable-AIG-Run-ID': result.headers.get('X-Lovable-AIG-Run-ID') as string, 'Access-Control-Expose-Headers': 'X-Lovable-AIG-Run-ID' } : {}),
    });
  } catch (error) { return errorResponse(error); }
});
