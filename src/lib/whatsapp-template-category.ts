// WhatsApp template categories (Meta pricing). Utility = non-promotional AND tied to the learner's own
// enrollment (or essential). Mixed or unclear content is billed as marketing, and Meta may approve a
// template submitted as UTILITY as MARKETING, or recategorize it later (template_category_update).

export const TEMPLATE_CATEGORIES = ["UTILITY", "MARKETING", "AUTHENTICATION"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const asCategory = (value: unknown): TemplateCategory | null => {
  const upper = typeof value === "string" ? value.trim().toUpperCase() : "";
  return (TEMPLATE_CATEGORIES as readonly string[]).includes(upper) ? (upper as TemplateCategory) : null;
};

/** Utility starting points for the templates the course flow sends ({{1}} learner name, {{2}} course title). */
export const UTILITY_TEMPLATE_DRAFTS: Record<string, { purpose: string; body: string; samples: string[]; quickReply?: string }> = {
  course_welcome: {
    purpose: "Enrollment confirmation sent when staff enroll a learner in a course.",
    body: "Hi {{1}}, your enrollment in {{2}} is confirmed. Your first lesson is ready in this chat. Reply here if you need help with your course.",
    samples: ["Abheejit", "WhatsApp Learning Essentials"],
  },
  course_day_ready: {
    purpose: "Tells an enrolled learner that their next scheduled lesson has unlocked, or that their paused course is waiting where they left off.",
    body: "Hi {{1}}, the next lesson in your {{2}} course is now available. Tap Start to open it.",
    samples: ["Abheejit", "WhatsApp Learning Essentials"],
    quickReply: "Start",
  },
};

export const templateKeyFromName = (name: string) => name.replace(/_v\d+$/, "");

/** Distinct {{n}} positions, ascending. */
export const placeholdersOf = (body: string) =>
  [...new Set([...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);

const firstAppearance = (body: string) => [...new Set([...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]))].join(",");
const hasOtherPlaceholders = (body: string) => /\{\{(?!\d+\}\})/.test(body);

/** Same {{n}} placeholders in the same order of first appearance, and no named or malformed ones. */
export const samePlaceholders = (a: string, b: string) =>
  firstAppearance(a) === firstAppearance(b) && !hasOtherPlaceholders(b);

const PROMOTIONAL: Array<[RegExp, string]> = [
  [/\b(\d+\s?% off|discount|coupon|promo(tion|tional)?|sale|deal|offer)\b/i, "offers or discounts"],
  [/\b(buy|shop|order now|purchase|upgrade|premium|renew|subscribe now)\b/i, "selling or upgrading"],
  [/\b(limited time|hurry|don'?t miss|last chance|act now|exclusive|special)\b/i, "urgency or exclusivity"],
  [/\b(new courses?|check out|explore (our|more)|recommend|you('ll| will) love|discover)\b/i, "promoting other courses or content"],
  [/\b(we miss you|come back|it'?s been a while|haven'?t seen you)\b/i, "re-engagement (retargeting)"],
  [/\b(invite|refer|share with (a )?friends?)\b/i, "referrals"],
  [/\bhappy birthday\b/i, "relationship-building greetings"],
];
const ENROLLMENT_CONTEXT = /\b(your|enrol(l)?(ed|ment)?|lesson|course|module|day|progress|quiz|certificate|paused|resume)\b/i;

/** Rule-of-thumb reasons a body may be categorized as marketing. Empty means nothing obvious. */
export function utilityIssues(body: string): string[] {
  const issues: string[] = [];
  const words = body.replace(/\{\{\d+\}\}/g, " ").replace(/[^\p{L}\p{N}' ]+/gu, " ").split(/\s+/).filter(Boolean);
  if (words.length < 5) issues.push("Too little text: unclear content (e.g. only {{1}} or \"Congratulations!\") is billed as marketing.");
  for (const [pattern, reason] of PROMOTIONAL) {
    const match = body.match(pattern);
    if (match) issues.push(`Promotional wording ("${match[0]}"): ${reason} is marketing, even when the learner asked for it.`);
  }
  if ((body.match(/!/g) ?? []).length > 1) issues.push("Several exclamation marks read as persuasive; keep a neutral, informational tone.");
  if (!body.includes("{{2}}") && !ENROLLMENT_CONTEXT.test(body))
    issues.push("Tie the message to the learner's own enrollment (their course, lesson or progress).");
  return issues;
}

export type CategoryState =
  | { state: "ok"; category: TemplateCategory | null }
  | { state: "pending_change"; category: TemplateCategory | null; correctCategory: TemplateCategory }
  | { state: "approved_as_other"; category: TemplateCategory; requested: TemplateCategory };

/**
 * Compares the category staff asked for, Meta's current category and correct_category (Message Templates
 * API). A non-empty correct_category that differs from category means Meta will recategorize it.
 */
export function categoryState(input: { category: unknown; correctCategory?: unknown; requestedCategory?: unknown }): CategoryState {
  const category = asCategory(input.category);
  const correct = asCategory(input.correctCategory);
  const requested = asCategory(input.requestedCategory);
  if (correct && correct !== category) return { state: "pending_change", category, correctCategory: correct };
  if (category && requested && category !== requested) return { state: "approved_as_other", category, requested };
  return { state: "ok", category };
}

export type TemplateWebhookUpdate = {
  kind: "category" | "status";
  /** When Meta sent the change (the webhook entry's time), used to ignore stale retries. */
  occurredAt: string | null;
  templateId: string | null;
  name: string | null;
  language: string | null;
  /** category: the template's category now (new_category). */
  category: TemplateCategory | null;
  previousCategory: TemplateCategory | null;
  correctCategory: TemplateCategory | null;
  /** status: APPROVED, REJECTED, PAUSED, … */
  status: string | null;
  reason: string | null;
};

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" ? String(value) : null);

/** Reads a WABA template_category_update or message_template_status_update change; anything else is null. */
export function parseTemplateWebhook(field: unknown, value: unknown, entryTime?: unknown): TemplateWebhookUpdate | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const seconds = Number(entryTime);
  const base = {
    templateId: text(v.message_template_id), name: text(v.message_template_name), language: text(v.message_template_language),
    occurredAt: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null,
  };
  if (!base.templateId && !base.name) return null;
  if (field === "template_category_update")
    return {
      kind: "category", ...base,
      category: asCategory(v.new_category), previousCategory: asCategory(v.previous_category), correctCategory: asCategory(v.correct_category),
      status: null, reason: null,
    };
  if (field === "message_template_status_update")
    return {
      kind: "status", ...base, category: null, previousCategory: null, correctCategory: null,
      status: text(v.event)?.toUpperCase() ?? null, reason: text(v.reason),
    };
  return null;
}

const REVIEW_STATUSES = ["DRAFT", "PENDING", "APPROVED", "REJECTED", "PAUSED", "ERROR", "IN_APPEAL", "DISABLED", "PENDING_DELETION", "DELETED", "LIMIT_EXCEEDED", "ARCHIVED"];

/**
 * The review status to store for a status Meta reports, or null to keep the stored one. FLAGGED is a quality
 * warning on a template that can still be sent, so it must not knock it out of the "latest APPROVED" lookup;
 * REINSTATED means approved again; anything unrecognised is recorded but never overwrites a status.
 */
export function nextReviewStatus(incoming: unknown): string | null {
  const status = typeof incoming === "string" ? incoming.trim().toUpperCase() : "";
  if (status === "REINSTATED") return "APPROVED";
  return REVIEW_STATUSES.includes(status) ? status : null;
}
