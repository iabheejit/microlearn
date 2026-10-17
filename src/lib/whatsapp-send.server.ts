import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseReplyTemplates, renderReplyTemplate } from "./whatsapp-template";
import { isWhatsAppReplyWindowOpen } from "./whatsapp-reply-window";

/** Rejected by WhatsApp; providerMessage is Meta's explanation, shown only to staff managing templates. */
export class WhatsAppRequestError extends Error {
  constructor(message: string, readonly providerMessage: string | null) { super(message); }
}

/** The one secured path to the WhatsApp gateway (sends, template lists and template submissions). */
export async function whatsappGateway(path: string, body?: unknown) {
  const gatewayKey = process.env.LOVABLE_API_KEY;
  const connectionKey = process.env.WHATSAPP_API_KEY;
  if (!gatewayKey || !connectionKey) throw new Error("The WhatsApp connection is not configured.");
  const response = await fetch(`https://connector-gateway.lovable.dev/whatsapp${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${gatewayKey}`, "X-Connection-Api-Key": connectionKey, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json() as { id?: string; status?: string; category?: string; data?: unknown[]; messages?: { id?: string }[]; error?: { code?: number; message?: string; error_user_msg?: string }; paging?: { cursors?: { after?: string }; next?: string } };
  if (!response.ok || payload.error) {
    if (payload.error?.code === 131047) return { windowClosed: true as const, payload };
    console.error("WhatsApp gateway rejected request", response.status, payload.error?.code);
    throw new WhatsAppRequestError("WhatsApp rejected the request. Check the approved template and recipient before trying again.", payload.error?.error_user_msg || payload.error?.message || null);
  }
  return { windowClosed: false as const, payload };
}
const gateway = whatsappGateway;

export async function approvedReplyTemplates(options: { allowQuickReplies?: boolean } = {}) {
  const templates = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page++) {
    const result = await gateway(`/message_templates?fields=id,name,status,language,category,components,parameter_format&limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`);
    templates.push(...parseReplyTemplates(result.payload, options));
    after = result.payload.paging?.next ? result.payload.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return templates;
}

export class WhatsAppWindowClosedError extends Error {}

/**
 * Automated course message (text, interactive buttons/list, or template). Free-form payloads need an open
 * 24-hour window; a closed window raises WhatsAppWindowClosedError so callers can fall back to a template.
 * The message is recorded in Chat History only after WhatsApp returns a real message ID.
 */
export async function sendAutomatedWhatsApp(phoneNumber: string, payload: Record<string, unknown>, content: string) {
  const phone = phoneNumber.replace(/\D/g, "");
  const result = await gateway("/messages", { messaging_product: "whatsapp", to: phone, ...payload });
  if (result.windowClosed) throw new WhatsAppWindowClosedError("WhatsApp reply window is closed for this learner.");
  const messageId = result.payload.messages?.[0]?.id;
  if (!messageId) throw new Error("WhatsApp did not return a message ID.");
  const templateName = payload.type === "template" ? String((payload.template as { name?: unknown } | undefined)?.name ?? "") || null : null;
  const { error } = await supabaseAdmin.from("whatsapp_messages").upsert({ phone_number: phone, direction: "outgoing", content, template_name: templateName, provider_message_id: messageId, status: "accepted" }, { onConflict: "provider_message_id", ignoreDuplicates: true });
  if (error) console.error("Automated WhatsApp message accepted but not saved", messageId, error.code);
  return messageId;
}

/** Automated reply to a learner who just messaged us (24h window is open by definition). */
export function sendAutomatedWhatsAppText(phoneNumber: string, text: string) {
  return sendAutomatedWhatsApp(phoneNumber, { type: "text", text: { body: text } }, text);
}

export type SendInput = { phoneNumber: string; message?: string; templateName?: string; language?: string; parameters?: string[] };
export type SendResult = { ok: true; messageId: string; status: "accepted"; historySaved: boolean } | { ok: false; code: "WINDOW_CLOSED" | "SEND_FAILED"; error: string };

export async function sendPortalWhatsApp(input: SendInput): Promise<SendResult> {
  const phone = input.phoneNumber.replace(/\D/g, "");
  let content = input.message ?? "";
  let body: Record<string, unknown>;
  if (input.templateName) {
    // Query the linked WABA, not the legacy cache: Meta is authoritative for approval and language.
    const template = (await approvedReplyTemplates()).find((t) => t.name === input.templateName && t.language === input.language);
    if (!template) throw new Error("This template is no longer approved on the MicroLearn WhatsApp connection. Refresh the template list.");
    const parameters = input.parameters ?? [];
    if (parameters.length !== template.variables.length || parameters.some((p) => !p.trim())) throw new Error("Fill in every template value before sending.");
    content = renderReplyTemplate(template, parameters);
    body = { type: "template", template: { name: template.name, language: { code: template.language }, components: parameters.length ? [{ type: "body", parameters: parameters.map((text) => ({ type: "text", text })) }] : [] } };
  } else {
    const { data, error } = await supabaseAdmin.from("whatsapp_messages").select("sent_at,provider_message_id").eq("phone_number", phone).eq("direction", "incoming").not("provider_message_id", "is", null).order("sent_at", { ascending: false }).limit(1);
    if (error) throw error;
    if (!isWhatsAppReplyWindowOpen((data ?? []).map((m) => ({ sent: false, timestamp: m.sent_at, providerMessageId: m.provider_message_id })))) return { ok: false, code: "WINDOW_CLOSED", error: "The 24-hour reply window is closed. Choose an approved template." };
    body = { type: "text", text: { body: content } };
  }
  const result = await gateway("/messages", { messaging_product: "whatsapp", to: phone, ...body });
  if (result.windowClosed) return { ok: false, code: "WINDOW_CLOSED", error: "WhatsApp closed the reply window. Choose an approved template." };
  const messageId = result.payload.messages?.[0]?.id;
  if (!messageId) throw new Error("WhatsApp did not return a message ID. Check Chat History before retrying.");
  const { error: historyError } = await supabaseAdmin.from("whatsapp_messages").upsert({ phone_number: phone, direction: "outgoing", content, template_name: input.templateName ?? null, provider_message_id: messageId, status: "accepted" }, { onConflict: "provider_message_id", ignoreDuplicates: true });
  // A staff reply answers whatever flagged the chat for attention, and starts the fallback cooldown so the
  // learner's answer to staff isn't met with the "couldn't match" menu.
  const sentAt = new Date().toISOString();
  const { error: contactError } = await supabaseAdmin.from("whatsapp_contacts").upsert({ phone_number: phone, updated_at: sentAt, needs_attention: false, attention_reason: null, attention_at: null, last_fallback_at: sentAt }, { onConflict: "phone_number" });
  if (historyError || contactError) console.error("WhatsApp accepted message but persistence failed", messageId, historyError?.code, contactError?.code);
  // A persistence failure must not encourage a duplicate send after Meta has already accepted it.
  return { ok: true, messageId, status: "accepted", historySaved: !historyError };
}