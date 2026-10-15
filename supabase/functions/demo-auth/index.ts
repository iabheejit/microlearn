import { z } from 'npm:zod';
import { createServiceClient } from '../_shared/auth.ts';
import { errorResponse, jsonResponse, optionsResponse } from '../_shared/responses.ts';

const DEMO_EMAIL = 'demo@example.com';
const Schema = z.object({ email: z.literal(DEMO_EMAIL), password: z.literal('demo123') });

// The demo credentials are public (they ship in the frontend), so the demo account must never be
// staff: it gets the learner role, which cannot read learner data or act on WhatsApp/Telegram.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  try {
    if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
    if (Deno.env.get('DEMO_AUTH_ENABLED') !== 'true') return jsonResponse({ error: 'Demo access is disabled' }, 403);
    const parsed = Schema.safeParse(await req.json());
    if (!parsed.success) return jsonResponse({ error: 'Invalid demo credentials' }, 401);
    const demoPassword = Deno.env.get('DEMO_AUTH_PASSWORD');
    if (!demoPassword) throw new Error('Demo access is not configured');
    const client = createServiceClient();

    let signIn = await client.auth.signInWithPassword({ email: DEMO_EMAIL, password: demoPassword });
    if (signIn.error) {
      const { error: createError } = await client.auth.admin.createUser({ email: DEMO_EMAIL, password: demoPassword, email_confirm: true, user_metadata: { first_name: 'Demo', last_name: 'Learner' } });
      if (createError) throw createError;
      signIn = await client.auth.signInWithPassword({ email: DEMO_EMAIL, password: demoPassword });
      if (signIn.error) throw signIn.error;
    }
    const user = signIn.data.user;

    const { data: existingRole, error: roleReadError } = await client.from('user_roles').select('id').eq('user_id', user.id).maybeSingle();
    if (roleReadError) throw roleReadError;
    const { error: roleError } = existingRole
      ? await client.from('user_roles').update({ role: 'learner', status: 'active' }).eq('id', existingRole.id)
      : await client.from('user_roles').insert({ user_id: user.id, role: 'learner', status: 'active' });
    if (roleError) throw roleError;

    return jsonResponse({ session: signIn.data.session });
  } catch (error) { return errorResponse(error); }
});
