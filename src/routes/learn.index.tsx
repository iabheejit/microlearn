import { createFileRoute } from "@tanstack/react-router";
import LearnerHome from "@/pages/learner/LearnerHome";
import { RequireAuth } from "@/components/AuthProvider";

export const Route = createFileRoute("/learn/")({
  component: () => (
    <RequireAuth audience="learner">
      <LearnerHome />
    </RequireAuth>
  ),
});
