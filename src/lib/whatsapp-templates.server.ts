import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { WhatsAppRequestError, whatsappGateway } from "./whatsapp-send.server";
import {
  asCategory,
  nextReviewStatus,
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
  const { data: versions, error } = await client.from("whatsapp_template_versions").select("id,provider_template_name,language,category,correct_category,review_status");
  if (error) throw error;
  const now = new Date().toISOString();
  for (const version of versions ?? []) {
    // Meta template names are unique per language, not globally.
    const remote = templates.find((t) => t.name === version.provider_template_name && t.language === version.language);
    if (!remote) continue;
    const status = nextReviewStatus(remote.status) ?? version.review_status;
    const categoryChanged = remote.category && remote.category !== version.category;
    const { error: updateError } = await client.from("whatsapp_template_versions").update({
      review_status: status,
      rejection_reason: status === "REJECTED" ? remote.rejectedReason || "Meta requested changes" : null,
      provider_template_id: remote.id,
      correct_category: remote.correctCategory,
      last_checked_at: now,
      // The catalog is Meta's current state, so webhooks sent before it are stale.
      provider_event_at: now,
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

type VersionMatch = { id: string; category: string; review_status: string; provider_event_at: string | null };

async function findVersion(client: Client, update: TemplateWebhookUpdate): Promise<VersionMatch | null> {
  const columns = "id,category,review_status,provider_event_at";
  if (update.name && update.language) {
    const { data, error } = await client.from("whatsapp_template_versions").select(columns)
      .eq("provider_template_name", update.name).eq("language", update.language).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  if (update.templateId) {
    // Template IDs are per name and language, so an ID match is exact.
    const { data, error } = await client.from("whatsapp_template_versions").select(columns).eq("provider_template_id", update.templateId).maybeSingle();
    if (error) throw error;
    return data;
  }
  return null;
}

/** Applies a template webhook (category update or review status) to the matching version row. */
export async function applyTemplateWebhook(client: Client, update: TemplateWebhookUpdate) {
  const version = await findVersion(client, update);
  // A retried webhook older than what we already stored must not roll the version back.
  const stale = Boolean(version?.provider_event_at && update.occurredAt && update.occurredAt < version.provider_event_at);
  const status = update.kind === "status" ? nextReviewStatus(update.status) : null;
  const now = new Date().toISOString();
  if (version && !stale) {
    const patch =
      update.kind === "category"
        ? {
            correct_category: update.correctCategory,
            // category_updated_at marks that Meta stated the category, even when it is unchanged.
            ...(update.category ? { category: update.category, category_updated_at: now } : {}),
            ...(update.category && update.category !== version.category
              ? { previous_category: update.previousCategory ?? version.category }
              : {}),
          }
        : status
          ? { review_status: status, rejection_reason: status === "REJECTED" ? update.reason || "Meta requested changes" : null }
          : {};
    if (Object.keys(patch).length) {
      const { error } = await client.from("whatsapp_template_versions")
        .update({ ...patch, last_checked_at: now, provider_event_at: update.occurredAt ?? now })
        .eq("id", version.id);
      if (error) throw error;
    }
  }
  // Every change is recorded, including flags, stale retries and templates created outside MicroLearn.
  const { error: eventError } = await client.from("whatsapp_template_events").insert({
    template_version_id: version?.id ?? null,
    event_type: update.kind === "category" ? "category_update" : "review_update",
    status: (update.kind === "category" ? update.category : update.status) ?? "UNKNOWN",
    details: {
      source: "webhook", template_name: update.name, template_id: update.templateId, language: update.language,
      previous_category: update.previousCategory, new_category: update.category, correct_category: update.correctCategory, reason: update.reason,
      occurred_at: update.occurredAt,
      ...(stale
        ? { ignored: "older than the stored update" }
        : update.kind === "status" && !status
          ? { ignored: "status kept; Meta reported a non-review event" }
          : {}),
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

/**
 * Submits the next version of a template key to Meta and makes it the key's active version. The row is
 * written before the request so an approval or category webhook that beats Meta's response still finds it;
 * activation happens in one transaction once Meta has accepted the template.
 */
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
  const now = new Date().toISOString();

  const { data: row, error: insertError } = await client.from("whatsapp_template_versions").insert({
    template_key: input.templateKey, version, provider_template_name: providerName, language: input.language,
    category: input.category, requested_category: input.category, body: input.body, sample_values: input.sampleValues, buttons,
    review_status: "DRAFT", submitted_by: input.actorId, submitted_at: now, last_checked_at: now, is_active: false,
  }).select("id").single();
  if (insertError) throw insertError;

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
    const message = error instanceof WhatsAppRequestError && error.providerMessage ? `Meta refused the template: ${error.providerMessage}` : error instanceof Error ? error.message : "Meta refused the template.";
    const { error: markError } = await client.from("whatsapp_template_versions").update({ review_status: "ERROR", rejection_reason: message.slice(0, 2000) }).eq("id", row.id);
    if (markError) console.error("Refused template version could not be marked ERROR", row.id, markError.code);
    const { error: failEventError } = await client.from("whatsapp_template_events").insert({ template_version_id: row.id, event_type: "submit_failed", status: "ERROR", actor_id: input.actorId, details: { provider_template_name: providerName, error: message.slice(0, 2000) } });
    if (failEventError) console.error("Refused template submission could not be recorded", row.id, failEventError.code);
    throw new Error(message);
  }

  // Meta may approve a UTILITY request as MARKETING; record what it answered beside what was requested.
  const category = asCategory(created.category) ?? input.category;
  const { error: providerError } = await client.from("whatsapp_template_versions").update({
    provider_template_id: created.id ? String(created.id) : null, provider_response: created,
  }).eq("id", row.id);
  if (providerError) throw providerError;
  // Status and category come from Meta's response only while no status or category webhook has updated the
  // row: one that beat the response is newer and must not be rolled back.
  const { error: statusError } = await client.from("whatsapp_template_versions")
    .update({ review_status: nextReviewStatus(created.status) ?? "PENDING" }).eq("id", row.id).eq("review_status", "DRAFT");
  if (statusError) throw statusError;
  if (category !== input.category) {
    const { error: categoryError } = await client.from("whatsapp_template_versions")
      .update({ category, previous_category: input.category, category_updated_at: new Date().toISOString() })
      .eq("id", row.id).is("category_updated_at", null);
    if (categoryError) throw categoryError;
  }
  const { error: activateError } = await client.rpc("activate_whatsapp_template_version", { p_version_id: row.id });
  if (activateError) throw activateError;

  const { data: saved, error: savedError } = await client.from("whatsapp_template_versions")
    .select("id,version,provider_template_name,provider_template_id,category,requested_category,review_status").eq("id", row.id).single();
  if (savedError) throw savedError;
  const { error: eventError } = await client.from("whatsapp_template_events").insert({
    template_version_id: row.id, event_type: "submitted", status: saved.review_status, actor_id: input.actorId,
    details: { provider_template_name: providerName, provider_template_id: saved.provider_template_id, requested_category: input.category, category },
  });
  if (eventError) throw eventError;
  return saved as { id: string; version: number; provider_template_name: string; category: string; requested_category: string; review_status: string };
}
