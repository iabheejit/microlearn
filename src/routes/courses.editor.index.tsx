import { createFileRoute } from "@tanstack/react-router";
import CourseEditor from "@/pages/CourseEditor";
import { RequireAuth } from "@/components/AuthProvider";

export const Route = createFileRoute("/courses/editor/")({
  component: () => (
    <RequireAuth>
      <CourseEditor />
    </RequireAuth>
  ),
});
