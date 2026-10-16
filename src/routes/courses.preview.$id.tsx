import { createFileRoute } from "@tanstack/react-router";
import CoursePreview from "@/pages/CoursePreview";
import { RequireAuth } from "@/components/AuthProvider";

export const Route = createFileRoute("/courses/preview/$id")({
  head: () => ({ meta: [
    { title: "Course & Learner Chat | MicroLearn" },
    { name: "description", content: "View MicroLearn course lessons, learner progress and real WhatsApp conversations." },
    { property: "og:title", content: "Course & Learner Chat | MicroLearn" },
    { property: "og:description", content: "Course lessons, learner progress and live WhatsApp conversations in MicroLearn." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => (
    <RequireAuth>
      <CoursePreview />
    </RequireAuth>
  ),
});
