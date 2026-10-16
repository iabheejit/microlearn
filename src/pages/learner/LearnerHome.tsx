import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { getLearnerHome, joinWebCourse } from "@/lib/learner.functions";
import { Link, useNavigate } from "@/lib/router-compat";
import LearnerLayout from "./LearnerLayout";

export default function LearnerHome() {
  const fetchHome = useServerFn(getLearnerHome);
  const join = useServerFn(joinWebCourse);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading, error } = useQuery({
    queryKey: ["learner-home"],
    queryFn: () => fetchHome(),
  });
  const joinMutation = useMutation({
    mutationFn: (courseId: string) => join({ data: { courseId } }),
    onSuccess: async ({ courseId }) => {
      await queryClient.invalidateQueries({ queryKey: ["learner-home"] });
      navigate(`/learn/${courseId}`);
    },
    onError: (e) =>
      toast({
        title: "Could not join",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      }),
  });

  return (
    <LearnerLayout>
      <h1 className="text-3xl font-bold">My courses</h1>
      {isLoading && (
        <p className="mt-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </p>
      )}
      {error && (
        <p className="mt-6 text-destructive">
          {error instanceof Error
            ? error.message
            : "Could not load your courses."}
        </p>
      )}
      {data && (
        <>
          {data.enrollments.length === 0 ? (
            <p className="mt-4 text-muted-foreground">
              You are not enrolled in any web course yet.{" "}
              {data.catalog.length
                ? "Pick one below to get started."
                : "Your instructor will invite you."}
            </p>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {data.enrollments.map((course) => (
                <Card key={course.courseId}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg">{course.title}</CardTitle>
                      <Badge
                        variant={
                          course.status === "completed"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {course.status === "completed"
                          ? "Completed"
                          : course.status === "paused"
                            ? "Paused"
                            : "In progress"}
                      </Badge>
                    </div>
                    {course.description && (
                      <CardDescription className="line-clamp-2">
                        {course.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <Progress
                      value={course.progress}
                      aria-label={`${course.progress}% complete`}
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {course.progress}% complete
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Button asChild>
                      <Link to={`/learn/${course.courseId}`}>
                        {course.status === "completed"
                          ? "Review"
                          : course.progress > 0
                            ? "Continue"
                            : "Start"}
                      </Link>
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}

          {data.catalog.length > 0 && (
            <section className="mt-10">
              <h2 className="text-xl font-semibold">Open courses</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {data.catalog.map((course) => (
                  <Card key={course.courseId}>
                    <CardHeader>
                      <CardTitle className="text-lg">{course.title}</CardTitle>
                      {course.description && (
                        <CardDescription className="line-clamp-3">
                          {course.description}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardFooter>
                      <Button
                        variant="outline"
                        disabled={joinMutation.isPending}
                        onClick={() => joinMutation.mutate(course.courseId)}
                      >
                        <BookOpen className="mr-2 h-4 w-4" />
                        Join course
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </LearnerLayout>
  );
}
