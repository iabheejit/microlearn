import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod';
import { createServiceClient } from '../_shared/auth.ts';
import { errorResponse, jsonResponse, optionsResponse } from '../_shared/responses.ts';

const Schema = z.object({ email: z.literal('demo@example.com'), password: z.literal('demo123') });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  try {
    if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
    const parsed = Schema.safeParse(await req.json());
    if (!parsed.success) return jsonResponse({ error: 'Invalid demo credentials' }, 401);
    const demoPassword = Deno.env.get('DEMO_AUTH_PASSWORD');
    if (!demoPassword) throw new Error('Demo access is not configured');
    const client = createServiceClient();
    const { data: users, error: listError } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw listError;
    let user = users.users.find((candidate) => candidate.email?.toLowerCase() === parsed.data.email);
    if (!user) {
      const { data, error } = await client.auth.admin.createUser({ email: parsed.data.email, password: demoPassword, email_confirm: true, user_metadata: { first_name: 'Demo', last_name: 'Creator' } });
      if (error) throw error;
      user = data.user;
    }
    const { error: roleError } = await client.from('user_roles').upsert({ user_id: user.id, role: 'content_creator', status: 'active' }, { onConflict: 'user_id,role', ignoreDuplicates: true });
    if (roleError && !roleError.message.includes('no unique')) throw roleError;
    const { data: session, error: sessionError } = await client.auth.signInWithPassword({ email: parsed.data.email, password: demoPassword });
    if (sessionError) throw sessionError;
    return jsonResponse({ session: session.session });
  } catch (error) { return errorResponse(error); }
});
