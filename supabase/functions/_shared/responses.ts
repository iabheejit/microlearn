import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

export const jsonResponse = (body: unknown, status = 200, extraHeaders?: HeadersInit) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', ...Object.fromEntries(new Headers(extraHeaders)) },
});

export const optionsResponse = () => new Response('ok', { headers: corsHeaders });

export const errorResponse = (error: unknown) => {
  if (error instanceof Response) {
    const headers = new Headers(error.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return new Response(error.body, { status: error.status, headers });
  }
  console.error(error);
  return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
};
