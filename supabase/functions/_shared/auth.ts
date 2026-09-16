import { createClient } from 'npm:@supabase/supabase-js@2';

export const createServiceClient = () => {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) throw new Error('Backend database is not configured');
  return createClient(url, serviceKey, { auth: { persistSession: false } });
};

export const requireUser = async (req: Request) => {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Response(JSON.stringify({ error: 'Sign in required' }), { status: 401 });
  const client = createServiceClient();
  const { data: { user }, error } = await client.auth.getUser(authorization.slice(7));
  if (error || !user) throw new Response(JSON.stringify({ error: 'Sign in required' }), { status: 401 });
  return { client, user };
};

export const requireStaff = async (req: Request) => {
  const result = await requireUser(req);
  const { data: role, error } = await result.client.from('user_roles').select('role,status').eq('user_id', result.user.id).maybeSingle();
  if (error || !role || role.status !== 'active' || !['admin', 'content_creator'].includes(role.role)) {
    throw new Response(JSON.stringify({ error: 'Staff access required' }), { status: 403 });
  }
  return result;
};
