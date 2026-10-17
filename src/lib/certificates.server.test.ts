import { afterEach, describe, expect, it } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import {
  appBaseUrl,
  certificateAttachment,
  certificateUrls,
  findCertificate,
  normalizeCode,
} from "./certificates.server";

const CODE = "1AE9D3C7C0A64534";

function setup() {
  const fake = fakeSupabase();
  fake
    .rows("courses")
    .push({ id: "c1", title: "WhatsApp Learning Essentials" });
  fake.rows("course_certificates").push({
    course_id: "c1",
    learner_name: "Ann",
    phone_number: "919766072308",
    verification_code: CODE,
    issued_at: "2026-10-16T15:48:33Z",
  });
  fake.rows("web_course_certificates").push({
    course_id: "c1",
    user_id: "u1",
    verification_code: "FFFFFFFFFFFFFFFF",
    issued_at: "2026-10-17T08:00:00Z",
  });
  fake.rows("profiles").push({ id: "u1", first_name: "Bo", last_name: "Chen" });
  return fake;
}

describe("normalizeCode", () => {
  it("accepts 16 hex characters in any case and trims", () => {
    expect(normalizeCode(" 1ae9d3c7c0a64534 ")).toBe(CODE);
    expect(normalizeCode(CODE)).toBe(CODE);
  });

  it("rejects anything else", () => {
    for (const bad of [
      "",
      "1AE9D3C7C0A6453",
      "1AE9D3C7C0A645341",
      "ZZE9D3C7C0A64534",
      "1AE9D3C7C0A64534; drop",
    ])
      expect(normalizeCode(bad)).toBeNull();
  });
});

describe("findCertificate", () => {
  it("finds a WhatsApp certificate without exposing the phone number", async () => {
    const found = await findCertificate(setup().client, CODE.toLowerCase());
    expect(found).toEqual({
      code: CODE,
      learnerName: "Ann",
      courseTitle: "WhatsApp Learning Essentials",
      issuedAt: "2026-10-16T15:48:33Z",
    });
    expect(JSON.stringify(found)).not.toContain("919766072308");
  });

  it("finds a web certificate and names the learner from their profile", async () => {
    expect(
      await findCertificate(setup().client, "FFFFFFFFFFFFFFFF"),
    ).toMatchObject({
      learnerName: "Bo Chen",
      courseTitle: expect.any(String),
    });
  });

  it("returns null for unknown or malformed codes", async () => {
    const { client } = setup();
    expect(await findCertificate(client, "0000000000000000")).toBeNull();
    expect(await findCertificate(client, "not-a-code")).toBeNull();
  });
});

describe("certificate URLs", () => {
  it("builds verify and PDF links, and an attachment with a safe filename", () => {
    expect(certificateUrls("https://app.test", CODE)).toEqual({
      verifyUrl: `https://app.test/verify/${CODE}`,
      pdfUrl: `https://app.test/api/public/certificates/${CODE}`,
    });
    expect(
      certificateAttachment("https://app.test", {
        code: CODE,
        courseTitle: "Money Basics",
      }),
    ).toMatchObject({ filename: "Certificate - Money Basics.pdf" });
  });
});

describe("appBaseUrl", () => {
  const original = process.env.PUBLIC_APP_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = original;
  });

  it("prefers PUBLIC_APP_URL, else uses the request origin, trimming slashes", () => {
    process.env.PUBLIC_APP_URL = "https://learn.example.com//";
    expect(appBaseUrl(new Request("https://internal.test/x"))).toBe(
      "https://learn.example.com",
    );
    delete process.env.PUBLIC_APP_URL;
    expect(appBaseUrl(new Request("https://internal.test/x?y=1"))).toBe(
      "https://internal.test",
    );
    expect(appBaseUrl()).toBe("");
  });
});
