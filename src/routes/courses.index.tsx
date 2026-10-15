import { createFileRoute } from "@tanstack/react-router";
import Courses from "@/pages/Courses";
import { RequireAuth } from "@/components/AuthProvider";

export const Route = createFileRoute("/courses/")({
  component: () => (
    <RequireAuth>
      <Courses />
    </RequireAuth>
  ),
});
