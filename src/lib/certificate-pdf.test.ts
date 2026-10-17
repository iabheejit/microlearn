import { describe, expect, it } from "vitest";
import {
  certificateFilename,
  pdfSafeText,
  renderCertificatePdf,
} from "./certificate-pdf";

const details = {
  learnerName: "Ann Lee",
  courseTitle: "WhatsApp Learning Essentials",
  issuedAt: "2026-10-16T15:48:33.226Z",
  code: "1AE9D3C7C0A64534",
  verifyUrl: "https://app.test/verify/1AE9D3C7C0A64534",
};

describe("renderCertificatePdf", () => {
  it("produces a one-page PDF", async () => {
    const bytes = await renderCertificatePdf(details);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(new TextDecoder().decode(bytes.slice(-6))).toContain("%%EOF");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("copes with names the built-in fonts cannot draw and very long titles", async () => {
    const bytes = await renderCertificatePdf({
      ...details,
      learnerName: "अभिजीत",
      courseTitle: "A very long course title ".repeat(12),
      issuedAt: "not a date",
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});

describe("pdfSafeText", () => {
  it("strips diacritics and unsupported characters", () => {
    expect(pdfSafeText("José  Núñez 🎓", "x")).toBe("Jose Nunez");
  });

  it("falls back when nothing drawable is left", () => {
    expect(pdfSafeText("अभिजीत", "Learner")).toBe("Learner");
    expect(pdfSafeText("   ", "Course")).toBe("Course");
  });
});

describe("certificateFilename", () => {
  it("builds a safe PDF name from the course title", () => {
    expect(certificateFilename("WhatsApp Learning Essentials")).toBe(
      "Certificate - WhatsApp Learning Essentials.pdf",
    );
    expect(certificateFilename('Bad/\\"name:*?')).toBe(
      "Certificate - Badname.pdf",
    );
    expect(certificateFilename("अभिजीत")).toBe("Certificate - Course.pdf");
  });
});
