import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

// Public: anyone holding a certificate code may see who earned what. Only safe fields are returned.
export const verifyCertificate = createServerFn({ method: "GET" })
  .inputValidator(z.object({ code: z.string().max(64) }))
  .handler(async ({ data }) => {
    const { findCertificate, appBaseUrl, certificateUrls, normalizeCode } =
      await import("./certificates.server");
    const code = normalizeCode(data.code);
    if (!code) return { found: false as const };
    const { serviceClient } = await import("./whatsapp-webhook.server");
    const record = await findCertificate(serviceClient(), code);
    if (!record) return { found: false as const };
    return {
      found: true as const,
      ...record,
      ...certificateUrls(appBaseUrl(getRequest()), code),
    };
  });
