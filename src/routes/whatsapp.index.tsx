import { createFileRoute } from "@tanstack/react-router";
import WhatsApp from "@/pages/WhatsApp";
import { RequireAuth } from "@/components/AuthProvider";

export const Route = createFileRoute("/whatsapp/")({
  component: () => (
    <RequireAuth>
      <WhatsApp />
    </RequireAuth>
  ),
});
