import { createFileRoute } from "@tanstack/react-router";

// Public certificate PDF. The code is the credential: 16 random hex characters, matched exactly.
export const Route = createFileRoute("/api/public/certificates/$code")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { normalizeCode, findCertificate, appBaseUrl, certificateUrls } =
          await import("@/lib/certificates.server");
        const code = normalizeCode(params.code);
        if (!code) return new Response("Not found", { status: 404 });
        const { serviceClient } = await import("@/lib/whatsapp-webhook.server");
        const record = await findCertificate(serviceClient(), code);
        if (!record) return new Response("Not found", { status: 404 });
        const { renderCertificatePdf, certificateFilename } =
          await import("@/lib/certificate-pdf");
        const bytes = await renderCertificatePdf({
          ...record,
          verifyUrl: certificateUrls(appBaseUrl(request), code).verifyUrl,
        });
        return new Response(bytes as BodyInit, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${certificateFilename(record.courseTitle)}"`,
            "Cache-Control": "public, max-age=86400",
          },
        });
      },
    },
  },
});
