import { createFileRoute } from "@tanstack/react-router";
import LearnerCourse from "@/pages/learner/LearnerCourse";
import { RequireAuth } from "@/components/AuthProvider";

export const Route = createFileRoute("/learn/$courseId")({
  component: function LearnerCourseRoute() {
    const { courseId } = Route.useParams();
    return (
      <RequireAuth audience="learner">
        <LearnerCourse courseId={courseId} />
      </RequireAuth>
    );
  },
});
