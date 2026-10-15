import { createFileRoute } from "@tanstack/react-router";
import Dashboard from "@/pages/Dashboard";
import { RequireAuth } from "@/components/AuthProvider";

export const Route = createFileRoute("/dashboard")({
  component: () => (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  ),
});
