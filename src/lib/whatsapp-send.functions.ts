import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

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

const requireActiveStaff = async (context: { supabase: SupabaseClient<Database>; userId: string }) => {
  const { data: role, error } = await context.supabase.from("user_roles").select("role,status").eq("user_id", context.userId).maybeSingle();
  if (error || role?.status !== "active" || !["admin", "content_creator"].includes(role.role)) throw new Error("Active staff access is required.");
};

const PhoneSchema = z.object({ phoneNumber: z.string().transform((p) => p.replace(/\D/g, "")).pipe(z.string().regex(/^[1-9]\d{6,14}$/)) });

/** Clears a chat's "Needs attention" flag; the flag itself is only ever set by the webhook. */
export const resolveWhatsAppAttention = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(PhoneSchema).handler(async ({ data, context }) => {
  await requireActiveStaff(context);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("whatsapp_contacts").update({ needs_attention: false, attention_reason: null, attention_at: null }).eq("phone_number", data.phoneNumber);
  if (error) throw new Error("The chat could not be marked resolved.");
  return { ok: true as const };
});

const BotSettingsSchema = z.object({
  fallback_enabled: z.boolean(),
  fallback_message: z.string().trim().min(1).max(1000),
  cooldown_minutes: z.number().int().min(0).max(1440),
  handoff_message: z.string().trim().min(1).max(1000),
});

/** Fallback menu and hand-off replies for WhatsApp messages that match no course step. */
export const updateWhatsAppBotSettings = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(BotSettingsSchema).handler(async ({ data, context }) => {
  await requireActiveStaff(context);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("whatsapp_bot_settings").upsert({ id: true, ...data, updated_at: new Date().toISOString(), updated_by: context.userId }, { onConflict: "id" });
  if (error) throw new Error("The auto-reply settings could not be saved.");
  return { ok: true as const };
});
