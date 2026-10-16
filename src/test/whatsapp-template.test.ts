import { describe, expect, it } from "vitest";
import { parseReplyTemplates, renderReplyTemplate } from "@/lib/whatsapp-template";

const approved = { id: "123", name: "course_welcome", status: "APPROVED", language: "en_US", components: [{ type: "BODY", text: "Hi {{1}}, welcome to {{2}}. {{1}}!" }] };
describe("WhatsApp reply templates", () => {
  it("keeps approval and language and deduplicates parameters", () => {
    const [t] = parseReplyTemplates({ data: [approved] });
    expect(t?.variables).toEqual(["1", "2"]);
    expect(t?.language).toBe("en_US");
    if (t) expect(renderReplyTemplate(t, ["Abheejit", "MicroLearn"])).toBe("Hi Abheejit, welcome to MicroLearn. Abheejit!");
  });
  it("does not offer pending or rejected templates", () => expect(parseReplyTemplates({ data: [{ ...approved, status: "PENDING" }, { ...approved, status: "REJECTED" }] })).toEqual([]));
  it("excludes unsupported media and dynamic headers", () => {
    expect(parseReplyTemplates({ data: [{ ...approved, components: [...approved.components, { type: "HEADER", format: "IMAGE" }] }] })).toEqual([]);
    expect(parseReplyTemplates({ data: [{ ...approved, components: [...approved.components, { type: "HEADER", format: "TEXT", text: "{{1}}" }] }] })).toEqual([]);
  });
  it("excludes noncontiguous and named parameters", () => {
    expect(parseReplyTemplates({ data: [{ ...approved, components: [{ type: "BODY", text: "Hi {{2}}" }] }, { ...approved, parameter_format: "NAMED" }] })).toEqual([]);
  });
});