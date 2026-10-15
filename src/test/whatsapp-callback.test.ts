import { afterEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";

const persist = vi.hoisted(() => vi.fn(async () => ({ status: "processed" })));
vi.mock("@/lib/whatsapp-webhook.server", () => ({ persistWhatsAppCallback: persist }));
import { Route } from "@/routes/api/public/whatsapp/webhook";

describe("WhatsApp callback verification", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

  async function call(secret: string, headers: Record<string, string> = {}) {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubEnv("WHATSAPP_API_KEY", "test-connection-key");
    vi.stubEnv("LOVABLE_API_KEY", "test-platform-key");
    const body = JSON.stringify({ entry: [] });
    const timestamp = String(Date.now());
    const key = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await webcrypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
    const hex = Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const request = new Request("http://localhost/api/public/whatsapp/webhook", { method: "POST", body, headers: {
      "x-lovable-timestamp": timestamp, "x-lovable-signature": `sha256=${hex}`,
      "x-lovable-delivery": "test-delivery", "x-lovable-event": "whatsapp.test", ...headers,
    } });
    const server = Route.options.server as { handlers: { POST: (args: { request: Request }) => Promise<Response> } };
    return server.handlers.POST({ request });
  }

  it("accepts the connection-key signature and calls persistence", async () => {
    expect((await call("test-connection-key")).status).toBe(200);
    expect(persist).toHaveBeenCalledWith("test-delivery", { entry: [] });
  });
  it("rejects a platform-key signature without writing data", async () => {
    expect((await call("test-platform-key")).status).toBe(401);
    expect(persist).not.toHaveBeenCalled();
  });
  it("requires delivery and event headers", async () => {
    expect((await call("test-connection-key", { "x-lovable-delivery": "" })).status).toBe(400);
    expect((await call("test-connection-key", { "x-lovable-event": "" })).status).toBe(400);
    expect(persist).not.toHaveBeenCalled();
  });
});