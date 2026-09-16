import { z } from 'npm:zod';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireUser } from '../_shared/auth.ts';
import { createEmbedding } from '../_shared/ai.ts';
import { errorResponse, jsonResponse, optionsResponse } from '../_shared/responses.ts';

const Schema = z.object({ text: z.string().trim().min(1).max(30000) });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  try {
    await requireUser(req);
    const parsed = Schema.safeParse(await req.json());
    if (!parsed.success) return jsonResponse({ error: parsed.error.flatten().fieldErrors }, 400);
    const result = await createEmbedding(parsed.data.text, req);
    return jsonResponse({ embedding: result.embedding, model: 'google/gemini-embedding-2' }, 200, {
      ...(result.headers.get('X-Lovable-AIG-Run-ID') ? { 'X-Lovable-AIG-Run-ID': result.headers.get('X-Lovable-AIG-Run-ID') as string, 'Access-Control-Expose-Headers': 'X-Lovable-AIG-Run-ID' } : {}),
    });
  } catch (error) { return errorResponse(error); }
});
