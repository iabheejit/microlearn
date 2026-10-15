import { createFileRoute } from "@tanstack/react-router";
import CoursePreview from "@/pages/CoursePreview";
import { RequireAuth } from "@/components/AuthProvider";

export const Route = createFileRoute("/courses/preview/$id")({
  component: () => (
    <RequireAuth>
      <CoursePreview />
    </RequireAuth>
  ),
});
