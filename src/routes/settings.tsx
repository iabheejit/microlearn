import { createFileRoute } from "@tanstack/react-router";
import Settings from "@/pages/Settings";
import { RequireAuth } from "@/components/AuthProvider";

export const Route = createFileRoute("/settings")({
  component: () => (
    <RequireAuth>
      <Settings />
    </RequireAuth>
  ),
});
