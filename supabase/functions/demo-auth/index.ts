import { jsonResponse, optionsResponse } from '../_shared/responses.ts';

// A shared public demo password must never mint a privileged production session.
// Keep this retired endpoint fail-closed for older published clients.
Deno.serve((req) => req.method === 'OPTIONS'
  ? optionsResponse()
  : jsonResponse({ error: 'Demo access is disabled. Sign in with your personal account.' }, 403));
