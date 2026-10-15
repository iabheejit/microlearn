import { createFileRoute } from "@tanstack/react-router";
import Analytics from "@/pages/Analytics";
import { RequireAuth } from "@/components/AuthProvider";

export const Route = createFileRoute("/analytics")({
  component: () => (
    <RequireAuth>
      <Analytics />
    </RequireAuth>
  ),
});
