import { createFileRoute } from "@tanstack/react-router";
import { verifyWebhookRequest } from "@lovable.dev/webhooks-js";
import {
  PayloadError,
  persistWhatsAppCallback,
  type InboundTextHandler,
} from "@/lib/whatsapp-webhook.server";
import { progressFromReply } from "@/lib/whatsapp-progression.server";

// Outcomes staff should see on the callback row even though the callback succeeded.
const PROGRESSION_NOTES: Record<string, string> = {
  ambiguous_enrollment:
    "Learner has more than one active course awaiting a reply; progression skipped.",
  no_lessons: "Enrolled course has no lessons; progression skipped.",
};

// Course progression runs on top of the verified, persisted callback.
const progressCourse: InboundTextHandler = async (client, message) =>
  PROGRESSION_NOTES[
    await progressFromReply(
      client,
      message.phone,
      {
        text: message.text,
        replyId: message.replyId,
        replyTitle: message.replyTitle,
      },
      message.id,
    )
  ] ?? null;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.WHATSAPP_API_KEY;
        if (!secret)
          return json(
            { error: "Callback verification is not configured" },
            500,
          );

        let payload: unknown;
        try {
          ({ payload } = await verifyWebhookRequest({
            req: request,
            secret,
            maxBodyBytes: 4 * 1024 * 1024,
          }));
        } catch (error) {
          const reason =
            error instanceof Error ? error.message : "invalid signature";
          return json({ error: `Verification failed: ${reason}` }, 401);
        }

        const deliveryId = request.headers.get("x-lovable-delivery")?.trim();
        const event = request.headers.get("x-lovable-event")?.trim();
        if (!deliveryId || !event)
          return json(
            { error: "Missing callback delivery or event header" },
            400,
          );
        try {
          const result = await persistWhatsAppCallback(
            deliveryId,
            payload,
            undefined,
            progressCourse,
          );
          return json({ ok: true, ...result });
        } catch (error) {
          console.error(`WhatsApp callback ${deliveryId} failed:`, error);
          // 400 for payloads we will never accept; 500 so transient failures are retried.
          if (error instanceof PayloadError)
            return json({ error: error.message }, 400);
          return json({ error: "Callback processing failed" }, 500);
        }
      },
    },
  },
});
