import { describe, expect, it } from "vitest";
import { isWhatsAppReplyWindowOpen, REPLY_WINDOW_MS } from "@/lib/whatsapp-reply-window";

describe("WhatsApp reply window", () => {
  const now = Date.parse("2026-10-15T16:23:00Z");
  const incoming = (age: number) => ({ sent: false, timestamp: new Date(now - age).toISOString(), providerMessageId: "wamid.real" });
  it("requires an actual incoming provider message", () => {
    expect(isWhatsAppReplyWindowOpen([], now)).toBe(false);
    expect(isWhatsAppReplyWindowOpen([{ ...incoming(1000), sent: true }], now)).toBe(false);
    expect(isWhatsAppReplyWindowOpen([{ ...incoming(1000), providerMessageId: null }], now)).toBe(false);
  });
  it("allows replies only before the 24-hour deadline", () => {
    expect(isWhatsAppReplyWindowOpen([incoming(1000)], now)).toBe(true);
    expect(isWhatsAppReplyWindowOpen([incoming(REPLY_WINDOW_MS)], now)).toBe(false);
    expect(isWhatsAppReplyWindowOpen([incoming(REPLY_WINDOW_MS + 1)], now)).toBe(false);
  });
  it("rejects invalid or future timestamps", () => {
    expect(isWhatsAppReplyWindowOpen([{ ...incoming(0), timestamp: "invalid" }], now)).toBe(false);
    expect(isWhatsAppReplyWindowOpen([incoming(-1000)], now)).toBe(false);
  });
});