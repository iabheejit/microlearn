import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { WhatsAppRequestError, whatsappGateway } from "./whatsapp-send.server";
import {
  asCategory,
  placeholdersOf,
  samePlaceholders,
  templateKeyFromName,
  utilityIssues,
  type TemplateCategory,
  type TemplateWebhookUpdate,
} from "./whatsapp-template-category";

// Template management for staff: the live WABA catalog with categories, utility rewrites, and new
// template versions. Meta is authoritative; whatsapp_template_versions mirrors what we submitted.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any>;

export type WabaTemplate = {
  id: string;
  name: string;
  templateKey: string;
  language: string;
  status: string;
  category: TemplateCategory | null;
  /** Non-empty and different from category: Meta will recategorize the template. */
  correctCategory: TemplateCategory | null;
  body: string;
  quickReplies: string[];
  rejectedReason: string | null;
};

const REVIEW_STATUSES = ["DRAFT", "PENDING", "APPROVED", "REJECTED", "PAUSED", "ERROR", "IN_APPEAL", "DISABLED", "PENDING_DELETION", "DELETED", "LIMIT_EXCEEDED", "ARCHIVED"];
const reviewStatus = (value: unknown) => {
  const upper = String(value ?? "").toUpperCase();
  return REVIEW_STATUSES.includes(upper) ? upper : "ERROR";
};

export async function listWabaTemplates(): Promise<WabaTemplate[]> {
  const templates: WabaTemplate[] = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page++) {
    const { payload } = await whatsappGateway(`/message_templates?fields=id,name,status,language,category,correct_category,components,rejected_reason&limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`);
    for (const item of (payload.data ?? []) as Record<string, unknown>[]) {
      if (typeof item.name !== "string") continue;
      const components = Array.isArray(item.components) ? (item.components as Record<string, unknown>[]) : [];
      const body = components.find((c) => c.type === "BODY");
      const buttons = components.find((c) => c.type === "BUTTONS");
      templates.push({
        id: String(item.id ?? `${item.name}-${String(item.language)}`),
        name: item.name,
        templateKey: templateKeyFromName(item.name),
        language: String(item.language ?? ""),
        status: String(item.status ?? "").toUpperCase(),
        category: asCategory(item.category),
        correctCategory: asCategory(item.correct_category),
        body: typeof body?.text === "string" ? body.text : "",
        quickReplies: Array.isArray(buttons?.buttons)
          ? (buttons.buttons as Record<string, unknown>[]).filter((b) => b.type === "QUICK_REPLY").map((b) => String(b.text ?? ""))
          : [],
        rejectedReason: typeof item.rejected_reason === "string" && item.rejected_reason !== "NONE" ? item.rejected_reason : null,
      });
    }
    after = payload.paging?.next ? payload.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return templates;
}

/** Mirrors Meta's status and category onto our version rows and records each category change. */
export async function syncTemplateVersions(client: Client, templates: WabaTemplate[]) {
  const { data: versions, error } = await client.from("whatsapp_template_versions").select("id,provider_template_name,category,correct_category,review_status");
  if (error) throw error;
  const now = new Date().toISOString();
  for (const version of versions ?? []) {
    const remote = templates.find((t) => t.name === version.provider_template_name);
    if (!remote) continue;
    const categoryChanged = remote.category && remote.category !== version.category;
    const { error: updateError } = await client.from("whatsapp_template_versions").update({
      review_status: reviewStatus(remote.status),
      rejection_reason: remote.status === "REJECTED" ? remote.rejectedReason || "Meta requested changes" : null,
      provider_template_id: remote.id,
      correct_category: remote.correctCategory,
      last_checked_at: now,
      ...(categoryChanged ? { category: remote.category, previous_category: version.category, category_updated_at: now } : {}),
    }).eq("id", version.id);
    if (updateError) throw updateError;
    if (categoryChanged || (remote.correctCategory && remote.correctCategory !== version.correct_category)) {
      const { error: eventError } = await client.from("whatsapp_template_events").insert({
        template_version_id: version.id, event_type: "category_update", status: remote.category ?? "UNKNOWN",
        details: { source: "sync", previous_category: version.category, new_category: remote.category, correct_category: remote.correctCategory },
      });
      if (eventError) throw eventError;
    }
  }
}

/** Applies a template webhook (category update or review status) to the matching version row. */
export async function applyTemplateWebhook(client: Client, update: TemplateWebhookUpdate) {
  let version: { id: string; category: string } | null = null;
  if (update.name) {
    const { data, error } = await client.from("whatsapp_template_versions").select("id,category").eq("provider_template_name", update.name).maybeSingle();
    if (error) throw error;
    version = data;
  }
  if (!version && update.templateId) {
    const { data, error } = await client.from("whatsapp_template_versions").select("id,category").eq("provider_template_id", update.templateId).maybeSingle();
    if (error) throw error;
    version = data;
  }
  const now = new Date().toISOString();
  if (version) {
    const patch =
      update.kind === "category"
        ? {
            correct_category: update.correctCategory,
            ...(update.category && update.category !== version.category
              ? { category: update.category, previous_category: update.previousCategory ?? version.category, category_updated_at: now }
              : {}),
          }
        : {
            review_status: reviewStatus(update.status),
            rejection_reason: update.status === "REJECTED" ? update.reason || "Meta requested changes" : null,
          };
    const { error } = await client.from("whatsapp_template_versions").update({ ...patch, last_checked_at: now }).eq("id", version.id);
    if (error) throw error;
  }
  // Templates created outside MicroLearn are still recorded so staff see every category change.
  const { error: eventError } = await client.from("whatsapp_template_events").insert({
    template_version_id: version?.id ?? null,
    event_type: update.kind === "category" ? "category_update" : "review_update",
    status: (update.kind === "category" ? update.category : update.status) ?? "UNKNOWN",
    details: {
      source: "webhook", template_name: update.name, template_id: update.templateId, language: update.language,
      previous_category: update.previousCategory, new_category: update.category, correct_category: update.correctCategory, reason: update.reason,
    },
  });
  if (eventError) throw eventError;
}

export type UtilityRewrite = { body: string; changes: string[]; issues: string[]; source: "ai" | "rules" };

const REWRITE_INSTRUCTIONS = `You rewrite WhatsApp Business message templates for MicroLearn, a course platform, so Meta categorizes them as UTILITY.
Utility rules (Meta template category guidelines):
- Must be non-promotional: no offers, discounts, upsells, cross-sells, recommendations of other courses, renewals, urgency, "we miss you"/come-back wording, referrals or persuasive tone.
- Must be specific to the learner: clearly about their own enrollment, lesson, progress, schedule or account (an update they signed up for).
- Mixed content (utility plus anything promotional) and unclear content (only a placeholder, "Congratulations!") are billed as MARKETING.
- Neutral, informational, concise. At most one emoji. No exclamation-heavy phrasing.
Keep every placeholder exactly as written ({{1}} is the learner's name and {{2}} the course title when present); do not add, remove or renumber placeholders. Keep the original language and meaning; keep any button wording the message refers to. Maximum 1024 characters.
Answer with JSON only: {"body": "<rewritten template>", "changes": ["<short reason for each change>"]}.`;

async function askAi(input: string) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Lovable AI is not configured.");
  const response = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch", "Content-Type": "application/json" },
    body: JSON.stringify({ model: "openai/gpt-6-astra", instructions: REWRITE_INSTRUCTIONS, input, reasoning: { effort: "low" }, store: false }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`Lovable AI request failed (${response.status}).`);
  const payload = (await response.json()) as { output_text?: string; output?: { content?: { type?: string; text?: string }[] }[] };
  return payload.output_text ?? (payload.output ?? []).flatMap((o) => o.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("");
}

/** Parses the model's JSON answer; anything that changes placeholders or breaks limits is refused. */
export function acceptRewrite(original: string, answer: string): { body: string; changes: string[] } | null {
  const json = answer.slice(answer.indexOf("{"), answer.lastIndexOf("}") + 1);
  try {
    const parsed = JSON.parse(json) as { body?: unknown; changes?: unknown };
    const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
    if (body.length < 20 || body.length > 1024 || !samePlaceholders(original, body)) return null;
    const changes = Array.isArray(parsed.changes) ? parsed.changes.filter((c): c is string => typeof c === "string").slice(0, 8) : [];
    return { body, changes };
  } catch {
    return null;
  }
}

/** Suggests utility wording for a staff-written template; falls back to rule hints if AI is unavailable. */
export async function rewriteForUtility(input: { body: string; purpose?: string; quickReply?: string }, ask = askAi): Promise<UtilityRewrite> {
  try {
    const answer = await ask(
      [
        input.purpose ? `Purpose: ${input.purpose}` : null,
        input.quickReply ? `Quick-reply button: "${input.quickReply}"` : null,
        `Template:\n${input.body}`,
      ].filter(Boolean).join("\n"),
    );
    const rewrite = acceptRewrite(input.body, answer);
    if (rewrite) return { ...rewrite, issues: utilityIssues(rewrite.body), source: "ai" };
    console.error("Utility rewrite discarded: placeholders or length changed");
  } catch (error) {
    console.error("Utility rewrite unavailable", error instanceof Error ? error.message : error);
  }
  return { body: input.body, changes: [], issues: utilityIssues(input.body), source: "rules" };
}

export type SubmitTemplateInput = {
  templateKey: string;
  body: string;
  sampleValues: string[];
  category: TemplateCategory;
  language: string;
  quickReply?: string;
  actorId: string;
};

/** Submits the next version of a template key to Meta and makes it the key's active version. */
export async function submitTemplateVersion(input: SubmitTemplateInput, client: Client = supabaseAdmin) {
  const positions = placeholdersOf(input.body);
  if (positions.some((p, i) => p !== i + 1) || input.sampleValues.length !== positions.length)
    throw new Error(`Provide one sample value for each placeholder from {{1}} to {{${positions.length}}}.`);

  const { data: latest, error: latestError } = await client.from("whatsapp_template_versions")
    .select("version").eq("template_key", input.templateKey).order("version", { ascending: false }).limit(1).maybeSingle();
  if (latestError) throw latestError;
  // Templates created outside MicroLearn (or deleted ones) can hold a name; Meta refuses duplicates.
  const taken = new Set((await listWabaTemplates()).map((t) => t.name));
  let version = (latest?.version ?? 0) + 1;
  const nameFor = (v: number) => (v === 1 ? input.templateKey : `${input.templateKey}_v${v}`);
  while (taken.has(nameFor(version))) version++;
  const providerName = nameFor(version);
  const buttons = input.quickReply ? [input.quickReply] : [];

  let created: { id?: string; status?: string; category?: string };
  try {
    ({ payload: created } = await whatsappGateway("/message_templates", {
      name: providerName,
      language: input.language,
      category: input.category,
      components: [
        { type: "BODY", text: input.body, ...(positions.length ? { example: { body_text: [input.sampleValues] } } : {}) },
        ...(buttons.length ? [{ type: "BUTTONS", buttons: buttons.map((text) => ({ type: "QUICK_REPLY", text })) }] : []),
      ],
    }));
  } catch (error) {
    if (error instanceof WhatsAppRequestError && error.providerMessage) throw new Error(`Meta refused the template: ${error.providerMessage}`);
    throw error;
  }
  // Meta may approve a UTILITY request as MARKETING; record what it answered, and what was requested.
  const category = asCategory(created.category) ?? input.category;
  const now = new Date().toISOString();
  const { error: deactivateError } = await client.from("whatsapp_template_versions").update({ is_active: false }).eq("template_key", input.templateKey);
  if (deactivateError) throw deactivateError;
  const { data: row, error: insertError } = await client.from("whatsapp_template_versions").insert({
    template_key: input.templateKey, version, provider_template_name: providerName, provider_template_id: created.id ? String(created.id) : null,
    language: input.language, category, requested_category: input.category, body: input.body, sample_values: input.sampleValues, buttons,
    review_status: reviewStatus(created.status || "PENDING"), provider_response: created, submitted_by: input.actorId,
    submitted_at: now, last_checked_at: now, is_active: true,
  }).select().single();
  if (insertError) throw insertError;
  const { error: eventError } = await client.from("whatsapp_template_events").insert({
    template_version_id: row.id, event_type: "submitted", status: row.review_status, actor_id: input.actorId,
    details: { provider_template_name: providerName, provider_template_id: row.provider_template_id, requested_category: input.category, category },
  });
  if (eventError) throw eventError;
  return row as { id: string; version: number; provider_template_name: string; category: string; requested_category: string; review_status: string };
}
