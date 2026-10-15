import { createFileRoute } from "@tanstack/react-router";
import WhatsAppWebhookStatus from "@/pages/WhatsAppWebhookStatus";
import { RequireAuth } from "@/components/AuthProvider";

export const Route = createFileRoute("/whatsapp/webhook-status")({
  component: () => (
    <RequireAuth>
      <WhatsAppWebhookStatus />
    </RequireAuth>
  ),
});
