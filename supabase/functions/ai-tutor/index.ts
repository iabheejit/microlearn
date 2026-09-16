import { z } from 'npm:zod';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireUser } from '../_shared/auth.ts';
import { createEmbedding, generateTutorReply } from '../_shared/ai.ts';
import { errorResponse, jsonResponse, optionsResponse } from '../_shared/responses.ts';

const Schema = z.object({
  query: z.string().trim().min(1).max(5000), courseId: z.string().uuid().nullable().optional(), persona: z.string().trim().max(500).default('supportive microlearning tutor'),
  context: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(5000) })).max(20).default([]),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  try {
    const { client, user } = await requireUser(req);
    const parsed = Schema.safeParse(await req.json());
    if (!parsed.success) return jsonResponse({ error: parsed.error.flatten().fieldErrors }, 400);
    const embeddingResult = await createEmbedding(parsed.data.query, req);
    const { data: resources, error: searchError } = await client.rpc('match_course_resources', {
      query_embedding: `[${embeddingResult.embedding.join(',')}]`, requested_course_id: parsed.data.courseId || null, match_count: 5,
    });
    if (searchError) throw searchError;
    const sources = (resources || []).filter((item: { similarity: number }) => item.similarity >= 0.35);
    const sourceText = sources.length ? sources.map((resource: { title: string; content: string }, index: number) => `[${index + 1}] ${resource.title}\n${resource.content}`).join('\n\n') : 'No matching course material was found.';
    const input = [
      ...parsed.data.context.map((item) => ({ role: item.role, content: [{ type: item.role === 'assistant' ? 'output_text' : 'input_text', text: item.content }] })),
      { role: 'user', content: [{ type: 'input_text', text: parsed.data.query }] },
    ];
    const result = await generateTutorReply(input, `You are a ${parsed.data.persona}. Answer clearly and concisely using the course material below. If the material does not answer the question, say that before offering general guidance. Cite useful sources as [1], [2], and so on.\n\nCOURSE MATERIAL\n${sourceText}`, req);
    const { error: historyError } = await client.from('chat_history').insert({ user_id: user.id, course_id: parsed.data.courseId || null, message: parsed.data.query, response: result.text, sources });
    if (historyError) throw historyError;
    return jsonResponse({ response: result.text, sources }, 200, {
      ...(result.headers.get('X-Lovable-AIG-Run-ID') ? { 'X-Lovable-AIG-Run-ID': result.headers.get('X-Lovable-AIG-Run-ID') as string, 'Access-Control-Expose-Headers': 'X-Lovable-AIG-Run-ID' } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return jsonResponse({ error: 'Request cancelled' }, 499);
    return errorResponse(error);
  }
});
