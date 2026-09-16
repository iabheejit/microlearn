const AI_BASE_URL = 'https://ai.gateway.lovable.dev/v1';

const gatewayHeaders = (key: string, req: Request) => ({
  'Lovable-API-Key': key,
  'X-Lovable-AIG-SDK': 'fetch',
  'Content-Type': 'application/json',
  ...(req.headers.get('X-Lovable-AIG-Run-ID') ? { 'X-Lovable-AIG-Run-ID': req.headers.get('X-Lovable-AIG-Run-ID') as string } : {}),
});

const gatewayError = async (response: Response) => {
  const body = await response.text();
  let message = body;
  try {
    const parsed = JSON.parse(body);
    message = parsed.message || parsed.error?.message || parsed.error || body;
  } catch { /* keep response text */ }
  return new Response(JSON.stringify({ error: String(message), status: response.status }), {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const createEmbedding = async (text: string, req: Request) => {
  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) throw new Response(JSON.stringify({ error: 'Lovable AI is not configured' }), { status: 500 });
  const response = await fetch(`${AI_BASE_URL}/embeddings`, {
    method: 'POST', headers: gatewayHeaders(key, req),
    body: JSON.stringify({ model: 'google/gemini-embedding-2', input: text }),
  });
  if (!response.ok) throw await gatewayError(response);
  const data = await response.json();
  if (!Array.isArray(data.data?.[0]?.embedding)) throw new Error('Lovable AI returned no embedding');
  return { embedding: data.data[0].embedding as number[], headers: response.headers };
};

export const generateTutorReply = async (input: Array<Record<string, unknown>>, instructions: string, req: Request) => {
  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) throw new Response(JSON.stringify({ error: 'Lovable AI is not configured' }), { status: 500 });
  const response = await fetch(`${AI_BASE_URL}/responses`, {
    method: 'POST', headers: gatewayHeaders(key, req), signal: req.signal,
    body: JSON.stringify({
      model: 'openai/gpt-6-astra', input, instructions, stream: true,
      reasoning: { effort: 'medium', summary: 'auto' },
      include: ['reasoning.encrypted_content'], store: false,
    }),
  });
  if (!response.ok) throw await gatewayError(response);
  if (!response.body) throw new Error('Lovable AI returned an empty stream');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let reasoning = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const event = JSON.parse(payload);
        if (event.type === 'response.output_text.delta') text += event.delta || '';
        if (event.type === 'response.reasoning_summary_text.delta') reasoning += event.delta || '';
      } catch { /* ignore keepalive/non-JSON events */ }
    }
  }
  const answer = text.trim() || reasoning.trim();
  if (!answer) throw new Error('Lovable AI returned no answer');
  return { text: answer, headers: response.headers };
};
