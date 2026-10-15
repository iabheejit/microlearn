import { createFileRoute } from "@tanstack/react-router";
import Telegram from "@/pages/Telegram";
import { RequireAuth } from "@/components/AuthProvider";

export const Route = createFileRoute("/telegram")({
  component: () => (
    <RequireAuth>
      <Telegram />
    </RequireAuth>
  ),
});
