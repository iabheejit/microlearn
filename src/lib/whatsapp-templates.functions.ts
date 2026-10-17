import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { TEMPLATE_CATEGORIES } from "./whatsapp-template-category";

async function requireStaff(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data: role, error } = await context.supabase.from("user_roles").select("role,status").eq("user_id", context.userId).maybeSingle();
  if (error || role?.status !== "active" || !["admin", "content_creator"].includes(role.role)) throw new Error("Active staff access is required.");
}

const TemplateBody = z.string().trim().min(20).max(1024);
const QuickReply = z.string().trim().min(1).max(25).optional();

/** Live WABA templates with category and correct_category; also mirrors them onto our version rows. */
export const listTemplateCatalog = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await requireStaff(context);
  const { listWabaTemplates, syncTemplateVersions } = await import("./whatsapp-templates.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const templates = await listWabaTemplates();
  await syncTemplateVersions(supabaseAdmin, templates);
  return templates;
});

/** Staff wording rewritten into utility language (non-promotional, about the learner's enrollment). */
export const rewriteTemplateForUtility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ body: TemplateBody, purpose: z.string().trim().max(300).optional(), quickReply: QuickReply }))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { rewriteForUtility } = await import("./whatsapp-templates.server");
    return rewriteForUtility(data);
  });

export const submitWhatsAppTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    templateKey: z.string().trim().regex(/^[a-z][a-z0-9_]{1,250}$/, "Use lowercase letters, numbers and underscores.").refine((key) => !/_v\d+$/.test(key), "Leave out the _v suffix; versions are added automatically."),
    body: TemplateBody,
    sampleValues: z.array(z.string().trim().min(1).max(256)).max(10),
    category: z.enum(TEMPLATE_CATEGORIES).refine((c) => c !== "AUTHENTICATION", "Authentication templates come from Meta's template library."),
    language: z.string().trim().regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, "Use a WhatsApp language code such as en_US.").default("en_US"),
    quickReply: QuickReply,
  }))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { submitTemplateVersion } = await import("./whatsapp-templates.server");
    try {
      return { ok: true as const, version: await submitTemplateVersion({ ...data, actorId: context.userId }) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "The template could not be submitted." };
    }
  });
