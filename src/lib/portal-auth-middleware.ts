import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

// The integration does not generate an auth attacher in this migrated project.
export const attachPortalAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers();
  if (data.session?.access_token) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  return next({ headers });
});