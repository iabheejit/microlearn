import { describe, expect, it } from "vitest";
import {
  UTILITY_TEMPLATE_DRAFTS,
  categoryState,
  parseTemplateWebhook,
  samePlaceholders,
  templateKeyFromName,
  utilityIssues,
} from "./whatsapp-template-category";
import { acceptRewrite, rewriteForUtility, syncTemplateVersions, type WabaTemplate } from "./whatsapp-templates.server";
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
    expect(samePlaceholders("Hi {{1}} {{2}}", "{{2}} and {{1}} again {{1}}")).toBe(true);
    expect(samePlaceholders("Hi {{1}} {{2}}", "Hi {{1}}")).toBe(false);
    expect(templateKeyFromName("course_welcome_v3")).toBe("course_welcome");
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
    rows("whatsapp_template_versions").push({ id: "v1", provider_template_name: "course_welcome", category: "UTILITY", correct_category: null, review_status: "PENDING" });
    await syncTemplateVersions(client, [remote({ category: "MARKETING", correctCategory: "MARKETING" })]);
    expect(rows("whatsapp_template_versions")[0]).toMatchObject({ category: "MARKETING", previous_category: "UTILITY", correct_category: "MARKETING", review_status: "APPROVED" });
    expect(rows("whatsapp_template_events")[0]).toMatchObject({ template_version_id: "v1", event_type: "category_update", status: "MARKETING" });
  });
});

describe("template webhooks", () => {
  const change = (field: string, value: Record<string, unknown>) => ({ entry: [{ changes: [{ field, value }] }] });

  it("parses only template fields", () => {
    expect(parseTemplateWebhook("messages", { message_template_id: 1 })).toBeNull();
    expect(parseTemplateWebhook("template_category_update", { message_template_id: 12, new_category: "marketing" })).toMatchObject({ kind: "category", templateId: "12", category: "MARKETING" });
  });

  it("applies a category update to the submitted version", async () => {
    const { client, rows } = fakeSupabase();
    rows("whatsapp_template_versions").push({ id: "v1", provider_template_name: "course_day_ready", provider_template_id: "55", category: "UTILITY" });
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
    rows("whatsapp_template_versions").push({ id: "v1", provider_template_name: "course_welcome_v2", category: "UTILITY", review_status: "PENDING" });
    await persistWhatsAppCallback("d-rej", change("message_template_status_update", {
      event: "REJECTED", message_template_id: 7, message_template_name: "course_welcome_v2", reason: "INCORRECT_CATEGORY",
    }), client);
    expect(rows("whatsapp_template_versions")[0]).toMatchObject({ review_status: "REJECTED", rejection_reason: "INCORRECT_CATEGORY" });

    await persistWhatsAppCallback("d-other", change("template_category_update", { message_template_id: 99, message_template_name: "promo", new_category: "MARKETING" }), client);
    expect(rows("whatsapp_template_events").at(-1)).toMatchObject({ template_version_id: null, event_type: "category_update" });
  });
});
