import { afterEach, describe, expect, it, vi } from "vitest";
import {
  UTILITY_TEMPLATE_DRAFTS,
  categoryState,
  nextReviewStatus,
  parseTemplateWebhook,
  samePlaceholders,
  templateKeyFromName,
  utilityIssues,
} from "./whatsapp-template-category";
import { acceptRewrite, rewriteForUtility, submitTemplateVersion, syncTemplateVersions, type WabaTemplate } from "./whatsapp-templates.server";
import { persistWhatsAppCallback } from "./whatsapp-webhook.server";
import { fakeSupabase } from "@/test/fake-supabase";

describe("utility wording", () => {
  it("finds nothing to flag in the course drafts", () => {
    for (const draft of Object.values(UTILITY_TEMPLATE_DRAFTS)) expect(utilityIssues(draft.body)).toEqual([]);
  });
  it("flags promotional, retargeting and unclear content", () => {
    expect(utilityIssues("Hi {{1}}, enjoy 20% off our new courses this week!").join(" ")).toMatch(/offers or discounts/);
    expect(utilityIssues("We miss you {{1}}! Come back and keep learning.").join(" ")).toMatch(/retargeting/);
    expect(utilityIssues("{{1}}").join(" ")).toMatch(/unclear content/);
  });
  it("compares placeholders and strips version suffixes", () => {
    expect(samePlaceholders("Hi {{1}} {{2}}", "{{1}}, welcome to {{2}}, {{1}}")).toBe(true);
    expect(samePlaceholders("Hi {{1}} {{2}}", "Hi {{1}}")).toBe(false);
    expect(samePlaceholders("Hi {{1}}, {{2}}", "{{2}} for {{1}}")).toBe(false);
    expect(samePlaceholders("Hi {{1}}", "Hi {{1}}, {{name}}")).toBe(false);
    expect(templateKeyFromName("course_welcome_v3")).toBe("course_welcome");
  });
});

describe("nextReviewStatus", () => {
  it("keeps a flagged template usable, reinstates and ignores unknown events", () => {
    expect(nextReviewStatus("FLAGGED")).toBeNull();
    expect(nextReviewStatus("REINSTATED")).toBe("APPROVED");
    expect(nextReviewStatus("SOMETHING_NEW")).toBeNull();
    expect(nextReviewStatus("rejected")).toBe("REJECTED");
  });
});

describe("categoryState", () => {
  it("reports a pending recategorization and a request Meta approved as another category", () => {
    expect(categoryState({ category: "UTILITY", correctCategory: "MARKETING" })).toEqual({ state: "pending_change", category: "UTILITY", correctCategory: "MARKETING" });
    expect(categoryState({ category: "MARKETING", correctCategory: "MARKETING", requestedCategory: "UTILITY" }).state).toBe("approved_as_other");
    expect(categoryState({ category: "UTILITY", correctCategory: "" }).state).toBe("ok");
  });
});

describe("utility rewrite", () => {
  const body = "Hi {{1}}, don't miss {{2}}! Exclusive lessons are waiting.";
  it("accepts a rewrite that keeps the placeholders", async () => {
    const result = await rewriteForUtility({ body }, async () => '```json\n{"body":"Hi {{1}}, your next lesson in {{2}} is ready.","changes":["Removed urgency"]}\n```');
    expect(result).toMatchObject({ source: "ai", body: "Hi {{1}}, your next lesson in {{2}} is ready.", changes: ["Removed urgency"], issues: [] });
  });
  it("refuses a rewrite that drops a placeholder and falls back to rule hints", async () => {
    expect(acceptRewrite(body, '{"body":"Hi {{1}}, your next lesson is ready now."}')).toBeNull();
    const result = await rewriteForUtility({ body }, async () => '{"body":"Hi {{1}}, your next lesson is ready now."}');
    expect(result.source).toBe("rules");
    expect(result.body).toBe(body);
    expect(result.issues.length).toBeGreaterThan(0);
  });
  it("falls back when AI is unavailable", async () => {
    const result = await rewriteForUtility({ body }, async () => { throw new Error("down"); });
    expect(result.source).toBe("rules");
  });
});

const remote = (overrides: Partial<WabaTemplate>): WabaTemplate => ({
  id: "t1", name: "course_welcome", templateKey: "course_welcome", language: "en_US", status: "APPROVED",
  category: "UTILITY", correctCategory: null, body: "Hi {{1}}", quickReplies: [], rejectedReason: null, ...overrides,
});

describe("template category sync", () => {
  it("mirrors Meta's category and records the change", async () => {
    const { client, rows } = fakeSupabase();
    rows("whatsapp_template_versions").push({ id: "v1", provider_template_name: "course_welcome", language: "en_US", category: "UTILITY", correct_category: null, review_status: "PENDING" });
    rows("whatsapp_template_versions").push({ id: "v2", provider_template_name: "course_welcome", language: "hi", category: "UTILITY", correct_category: null, review_status: "PENDING" });
    await syncTemplateVersions(client, [remote({ category: "MARKETING", correctCategory: "MARKETING" })]);
    expect(rows("whatsapp_template_versions")[1]).toMatchObject({ category: "UTILITY", review_status: "PENDING" });
    expect(rows("whatsapp_template_versions")[0]).toMatchObject({ category: "MARKETING", previous_category: "UTILITY", correct_category: "MARKETING", review_status: "APPROVED" });
    expect(rows("whatsapp_template_events")[0]).toMatchObject({ template_version_id: "v1", event_type: "category_update", status: "MARKETING" });
  });
});

describe("template webhooks", () => {
  const change = (field: string, value: Record<string, unknown>, time = 1792200000) => ({ entry: [{ time, changes: [{ field, value }] }] });

  it("parses only template fields", () => {
    expect(parseTemplateWebhook("messages", { message_template_id: 1 })).toBeNull();
    expect(parseTemplateWebhook("template_category_update", { message_template_id: 12, new_category: "marketing" })).toMatchObject({ kind: "category", templateId: "12", category: "MARKETING" });
  });

  it("applies a category update to the submitted version", async () => {
    const { client, rows } = fakeSupabase();
    rows("whatsapp_template_versions").push({ id: "v1", provider_template_name: "course_day_ready", language: "en_US", provider_template_id: "55", category: "UTILITY" });
    const result = await persistWhatsAppCallback("d-cat", change("template_category_update", {
      message_template_id: 55, message_template_name: "course_day_ready", message_template_language: "en_US",
      previous_category: "UTILITY", new_category: "MARKETING",
    }), client);
    expect(result).toEqual({ status: "processed" });
    expect(rows("whatsapp_template_versions")[0]).toMatchObject({ category: "MARKETING", previous_category: "UTILITY" });
    expect(rows("whatsapp_template_events")[0]).toMatchObject({ template_version_id: "v1", event_type: "category_update", status: "MARKETING" });
    expect(rows("whatsapp_webhook_callbacks")[0]).toMatchObject({ event_type: "template", status: "processed" });
  });

  it("records a rejection, and changes to templates created outside MicroLearn", async () => {
    const { client, rows } = fakeSupabase();
    rows("whatsapp_template_versions").push({ id: "v1", provider_template_name: "course_welcome_v2", language: "en_US", category: "UTILITY", review_status: "PENDING" });
    await persistWhatsAppCallback("d-rej", change("message_template_status_update", {
      event: "REJECTED", message_template_id: 7, message_template_name: "course_welcome_v2", message_template_language: "en_US", reason: "INCORRECT_CATEGORY",
    }), client);
    expect(rows("whatsapp_template_versions")[0]).toMatchObject({ review_status: "REJECTED", rejection_reason: "INCORRECT_CATEGORY" });

    await persistWhatsAppCallback("d-other", change("template_category_update", { message_template_id: 99, message_template_name: "promo", new_category: "MARKETING" }), client);
    expect(rows("whatsapp_template_events").at(-1)).toMatchObject({ template_version_id: null, event_type: "category_update" });
  });
});

describe("template status webhooks", () => {
  const status = (event: string, time: number, language = "en_US") => ({
    entry: [{ time, changes: [{ field: "message_template_status_update", value: { event, message_template_id: 8, message_template_name: "course_welcome_v3", message_template_language: language } }] }],
  });
  const seed = () => {
    const db = fakeSupabase();
    db.rows("whatsapp_template_versions").push({ id: "v3", provider_template_name: "course_welcome_v3", language: "en_US", category: "UTILITY", review_status: "APPROVED", provider_event_at: null });
    return db;
  };

  it("keeps a flagged template approved and records the flag", async () => {
    const { client, rows } = seed();
    await persistWhatsAppCallback("d-flag", status("FLAGGED", 1792200100), client);
    expect(rows("whatsapp_template_versions")[0]).toMatchObject({ review_status: "APPROVED" });
    expect(rows("whatsapp_template_events")[0]).toMatchObject({ event_type: "review_update", status: "FLAGGED" });
    await persistWhatsAppCallback("d-paused", status("PAUSED", 1792200200), client);
    await persistWhatsAppCallback("d-back", status("REINSTATED", 1792200300), client);
    expect(rows("whatsapp_template_versions")[0]).toMatchObject({ review_status: "APPROVED" });
  });

  it("ignores a retried webhook older than the stored update", async () => {
    const { client, rows } = seed();
    await persistWhatsAppCallback("d-new", status("PAUSED", 1792200500), client);
    await persistWhatsAppCallback("d-old", status("APPROVED", 1792200400), client);
    expect(rows("whatsapp_template_versions")[0]).toMatchObject({ review_status: "PAUSED" });
    expect(rows("whatsapp_template_events").at(-1)?.details).toMatchObject({ ignored: "older than the stored update" });
  });

  it("does not touch the same name in another language", async () => {
    const { client, rows } = seed();
    await persistWhatsAppCallback("d-hi", { entry: [{ time: 1792200600, changes: [{ field: "message_template_status_update", value: { event: "REJECTED", message_template_name: "course_welcome_v3", message_template_language: "hi" } }] }] }, client);
    expect(rows("whatsapp_template_versions")[0]).toMatchObject({ review_status: "APPROVED" });
  });
});

describe("submitTemplateVersion", () => {
  afterEach(() => vi.unstubAllGlobals());
  const input = { templateKey: "course_welcome", body: "Hi {{1}}, your enrollment in {{2}} is confirmed.", sampleValues: ["A", "B"], category: "UTILITY" as const, language: "en_US", actorId: "u1" };
  const stubMeta = (onCreate: () => Response | Promise<Response>) => {
    vi.stubEnv("LOVABLE_API_KEY", "k");
    vi.stubEnv("WHATSAPP_API_KEY", "w");
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST" ? onCreate() : new Response(JSON.stringify({ data: [{ id: "1", name: "course_welcome", language: "en_US", status: "APPROVED", category: "UTILITY", components: [] }] }))));
  };
  const db = () => {
    const activated: unknown[] = [];
    const fake = fakeSupabase({ rpc: { activate_whatsapp_template_version: (args) => {
      activated.push(args.p_version_id);
      fake.rows("whatsapp_template_versions").forEach((r) => { r.is_active = r.id === args.p_version_id; });
      return { error: null };
    } } });
    fake.rows("whatsapp_template_versions").push({ id: "old", template_key: "course_welcome", version: 1, provider_template_name: "course_welcome", language: "en_US", is_active: true, review_status: "APPROVED" });
    return { ...fake, activated };
  };

  it("writes the row before Meta answers, keeps a faster webhook's status and activates atomically", async () => {
    const { client, rows, activated } = db();
    stubMeta(async () => {
      // An approval webhook lands while the create request is still in flight.
      await persistWhatsAppCallback("d-fast", { entry: [{ time: 1792200700, changes: [{ field: "message_template_status_update", value: { event: "APPROVED", message_template_name: "course_welcome_v2", message_template_language: "en_US" } }] }] }, client);
      return new Response(JSON.stringify({ id: "99", status: "PENDING", category: "MARKETING" }));
    });
    const saved = await submitTemplateVersion(input, client);
    expect(saved).toMatchObject({ provider_template_name: "course_welcome_v2", review_status: "APPROVED", category: "MARKETING", requested_category: "UTILITY" });
    expect(activated).toEqual([saved.id]);
    expect(rows("whatsapp_template_versions").filter((r) => r.is_active).map((r) => r.id)).toEqual([saved.id]);
  });

  it("keeps the current version active when Meta refuses the template", async () => {
    const { client, rows, activated } = db();
    stubMeta(() => new Response(JSON.stringify({ error: { code: 100, error_user_msg: "Name already exists" } }), { status: 400 }));
    await expect(submitTemplateVersion(input, client)).rejects.toThrow("Meta refused the template: Name already exists");
    expect(activated).toEqual([]);
    expect(rows("whatsapp_template_versions").find((r) => r.provider_template_name === "course_welcome_v2")).toMatchObject({ review_status: "ERROR", is_active: false });
    expect(rows("whatsapp_template_versions").find((r) => r.id === "old")).toMatchObject({ is_active: true });
  });
});

describe("submitTemplateVersion ordering", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("keeps a category webhook that beat Meta's response", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "k");
    vi.stubEnv("WHATSAPP_API_KEY", "w");
    const fake = fakeSupabase({ rpc: { activate_whatsapp_template_version: () => ({ error: null }) } });
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method !== "POST") return new Response(JSON.stringify({ data: [] }));
      await persistWhatsAppCallback("d-cat-fast", { entry: [{ time: 1792200800, changes: [{ field: "template_category_update", value: { message_template_name: "nudge", message_template_language: "en_US", previous_category: "MARKETING", new_category: "UTILITY" } }] }] }, fake.client);
      return new Response(JSON.stringify({ id: "5", status: "PENDING", category: "MARKETING" }));
    }));
    const saved = await submitTemplateVersion({ templateKey: "nudge", body: "Hi {{1}}, your next lesson is ready.", sampleValues: ["A"], category: "UTILITY", language: "en_US", actorId: "u1" }, fake.client);
    expect(saved).toMatchObject({ category: "UTILITY", review_status: "PENDING" });
  });
});
