import { createFileRoute } from "@tanstack/react-router";
import Users from "@/pages/Users";
import { RequireAuth } from "@/components/AuthProvider";

export const Route = createFileRoute("/users")({
  component: () => (
    <RequireAuth>
      <Users />
    </RequireAuth>
  ),
});
