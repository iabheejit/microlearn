import { createFileRoute } from "@tanstack/react-router";
import CourseEditor from "@/pages/CourseEditor";
import { RequireAuth } from "@/components/AuthProvider";

export const Route = createFileRoute("/courses/editor/$id")({
  component: () => (
    <RequireAuth>
      <CourseEditor />
    </RequireAuth>
  ),
});
