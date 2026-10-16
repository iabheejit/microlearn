import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SendSchema = z.object({
  phoneNumber: z.string().transform((p) => p.replace(/\D/g, "")).pipe(z.string().regex(/^[1-9]\d{6,14}$/, "Enter a full international phone number.")),
  message: z.string().trim().min(1).max(4096).optional(),
  templateName: z.string().min(1).max(512).optional(),
  language: z.string().min(2).max(20).optional(),
  parameters: z.array(z.string().trim().min(1).max(1024)).max(20).optional(),
}).refine((d) => d.templateName ? Boolean(d.language) && !d.message : Boolean(d.message), "Choose a template or enter a reply.");

export const listPortalReplyTemplates = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: role, error } = await context.supabase.from("user_roles").select("role,status").eq("user_id", context.userId).maybeSingle();
  if (error || role?.status !== "active" || !["admin", "content_creator"].includes(role.role)) throw new Error("Active staff access is required.");
  const { approvedReplyTemplates } = await import("./whatsapp-send.server");
  return approvedReplyTemplates();
});

export const sendPortalReply = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(SendSchema).handler(async ({ data, context }) => {
  const { data: role, error } = await context.supabase.from("user_roles").select("role,status").eq("user_id", context.userId).maybeSingle();
  if (error || role?.status !== "active" || !["admin", "content_creator"].includes(role.role)) throw new Error("Active staff access is required to send WhatsApp messages.");
  const { sendPortalWhatsApp } = await import("./whatsapp-send.server");
  try { return await sendPortalWhatsApp(data); }
  catch (error) { return { ok: false as const, code: "SEND_FAILED" as const, error: error instanceof Error ? error.message : "The message could not be sent." }; }
});
/** Approved templates usable as course nudges: at most two values ({{1}} name, {{2}} course), quick replies allowed. */
export const listNudgeTemplates = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: role, error } = await context.supabase.from("user_roles").select("role,status").eq("user_id", context.userId).maybeSingle();
  if (error || role?.status !== "active" || !["admin", "content_creator"].includes(role.role)) throw new Error("Active staff access is required.");
  const { approvedReplyTemplates } = await import("./whatsapp-send.server");
  return (await approvedReplyTemplates({ allowQuickReplies: true })).filter((template) => template.variables.length <= 2);
});
