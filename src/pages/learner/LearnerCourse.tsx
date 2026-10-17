import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { useAITutor } from "@/hooks/useAITutor";
import { formatUnlockTime } from "@/lib/course-engine";
import {
  getWebCourseState,
  joinWebCourse,
  submitWebStep,
} from "@/lib/learner.functions";
import { Link } from "@/lib/router-compat";
import { ROUTES } from "@/lib/constants";
import LearnerLayout from "./LearnerLayout";

export default function LearnerCourse({ courseId }: { courseId: string }) {
  const fetchState = useServerFn(getWebCourseState);
  const submit = useServerFn(submitWebStep);
  const join = useServerFn(joinWebCourse);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    text: string;
  } | null>(null);
  const queryKey = ["learner-course", courseId];
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchState({ data: { courseId } }),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey });
    await queryClient.invalidateQueries({ queryKey: ["learner-home"] });
  };
  const step = useMutation({
    mutationFn: (input: {
      resourceId: string;
      step: "lesson" | "question";
      answer?: string;
    }) => submit({ data: { courseId, ...input } }),
    onSuccess: async (result) => {
      if (result.status === "incorrect") {
        setFeedback({
          correct: false,
          text: `Not quite. ${result.explanation || "Please try again."}`,
        });
        return;
      }
      setAnswer("");
      // Correct-answer feedback stays visible above the next lesson until the learner moves on.
      setFeedback(
        result.status === "correct"
          ? {
              correct: true,
              text: `Correct! ${result.explanation ?? ""}`.trim(),
            }
          : result.status === "revealed"
            ? {
                correct: false,
                text: `The answer was ${result.answer}. ${result.explanation ?? ""}`.trim(),
              }
            : null,
      );
      if (result.status === "stale")
        toast({
          title: "Updated",
          description:
            "This course moved on in another window, so we reloaded it.",
        });
      if (
        result.status === "completed" ||
        ((result.status === "correct" || result.status === "revealed") &&
          result.next === "completed")
      ) {
        toast({
          title: "Course complete!",
          description: "Your certificate is ready.",
        });
      }
      await refresh();
    },
    onError: (e) =>
      toast({
        title: "Could not continue",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      }),
  });
  const joinMutation = useMutation({
    mutationFn: () => join({ data: { courseId } }),
    onSuccess: refresh,
    onError: (e) =>
      toast({
        title: "Could not join",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      }),
  });

  const hasOutline = data && "outline" in data;
  return (
    <LearnerLayout>
      <Link
        to={ROUTES.LEARN}
        className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        My courses
      </Link>
      {isLoading && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </p>
      )}
      {error && (
        <p className="text-destructive">
          {error instanceof Error
            ? error.message
            : "This course could not be loaded."}
        </p>
      )}
      {data && (
        <>
          <h1 className="text-3xl font-bold">{data.course.title}</h1>
          {data.state === "not_enrolled" && (
            <Card className="mt-6">
              <CardContent className="pt-6">
                {data.course.description && (
                  <p className="mb-4 text-muted-foreground">
                    {data.course.description}
                  </p>
                )}
                {data.canJoin ? (
                  <Button
                    onClick={() => joinMutation.mutate()}
                    disabled={joinMutation.isPending}
                  >
                    Join course
                  </Button>
                ) : (
                  <p className="text-muted-foreground">
                    This course is invite-only. Ask your instructor to enroll
                    you.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          {data.state === "paused" && (
            <p className="mt-6 text-muted-foreground">
              Your enrollment is paused. Contact your instructor to resume.
            </p>
          )}
          {data.state === "empty" && (
            <p className="mt-6 text-muted-foreground">
              This course has no lessons yet.
            </p>
          )}

          {hasOutline && data.state !== "paused" && data.state !== "empty" && (
            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_16rem]">
              <div className="space-y-6">
                <div>
                  <Progress
                    value={data.progress}
                    aria-label={`${data.progress}% complete`}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.progress}% complete
                  </p>
                </div>

                {feedback?.correct && data.state !== "question" && (
                  <p
                    role="status"
                    className="flex items-center gap-2 text-sm text-primary"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {feedback.text}
                  </p>
                )}

                {data.state === "completed" && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Award className="h-5 w-5 text-primary" />
                        You completed this course
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {data.certificate ? (
                        <div className="space-y-3">
                          <p>
                            Certificate verification code:{" "}
                            <span className="font-mono font-semibold">
                              {data.certificate.code}
                            </span>
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Button asChild size="sm">
                              <a href={data.certificate.pdfUrl}>
                                Download certificate
                              </a>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const url = `${window.location.origin}${data.certificate?.verifyUrl}`;
                                navigator.clipboard
                                  ?.writeText(url)
                                  .then(() =>
                                    toast({ title: "Verify link copied" }),
                                  );
                              }}
                            >
                              Copy verify link
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">
                          Your certificate is being issued.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {data.state === "locked" && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-primary" />
                        Day {data.unlock.day} is on its way
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>
                        Great work today. Day {data.unlock.day} unlocks{" "}
                        {formatUnlockTime(data.unlock.at, data.unlock.timezone)}
                        .
                      </p>
                    </CardContent>
                  </Card>
                )}

                {data.state === "learning" && (
                  <Card>
                    <CardHeader>
                      <p className="text-sm text-muted-foreground">
                        Day {data.lesson.day} of {data.lesson.dayCount} · Lesson{" "}
                        {data.lesson.position} of {data.lessonCount}
                      </p>
                      <CardTitle>{data.lesson.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Lesson text is rendered as plain text, never as HTML. */}
                      <div className="whitespace-pre-wrap leading-relaxed">
                        {data.lesson.content}
                      </div>
                      <Button
                        onClick={() => {
                          setFeedback(null);
                          step.mutate({
                            resourceId: data.lesson.id,
                            step: "lesson",
                          });
                        }}
                        disabled={step.isPending}
                      >
                        Next
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {data.state === "question" && (
                  <Card>
                    <CardHeader>
                      <p className="text-sm text-muted-foreground">
                        Day {data.lesson.day} · Lesson {data.lesson.position}:{" "}
                        {data.lesson.title}
                      </p>
                      <CardTitle>{data.quiz.question}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <form
                        className="space-y-4"
                        onSubmit={(event) => {
                          event.preventDefault();
                          step.mutate({
                            resourceId: data.lesson.id,
                            step: "question",
                            answer,
                          });
                        }}
                      >
                        {data.quiz.options.length ? (
                          <RadioGroup
                            value={answer}
                            onValueChange={(value) => {
                              setAnswer(value);
                              setFeedback(null);
                            }}
                          >
                            {data.quiz.options.map((option, index) => (
                              <div
                                key={index}
                                className="flex items-center gap-2"
                              >
                                <RadioGroupItem
                                  id={`option-${index}`}
                                  value={String(index + 1)}
                                />
                                <Label htmlFor={`option-${index}`}>
                                  {option}
                                </Label>
                              </div>
                            ))}
                          </RadioGroup>
                        ) : (
                          <Textarea
                            aria-label="Your answer"
                            value={answer}
                            onChange={(event) => {
                              setAnswer(event.target.value);
                              setFeedback(null);
                            }}
                          />
                        )}
                        {feedback && !feedback.correct && (
                          <p role="status" className="text-sm text-destructive">
                            {feedback.text}
                          </p>
                        )}
                        <Button
                          type="submit"
                          disabled={!answer.trim() || step.isPending}
                        >
                          Check answer
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                )}
                <TutorPanel courseId={courseId} />
              </div>

              <nav aria-label="Course outline">
                <h2 className="mb-2 text-sm font-semibold">Lessons</h2>
                <ol className="space-y-2 text-sm">
                  {data.outline.map((item, index) => (
                    <li key={item.id}>
                      {(index === 0 ||
                        data.outline[index - 1].day !== item.day) && (
                        <p className="mb-1 mt-3 text-xs font-semibold uppercase text-muted-foreground">
                          Day {item.day}
                        </p>
                      )}
                      <span className="flex items-start gap-2">
                        {item.done ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        ) : (
                          <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span
                          className={item.done ? "text-muted-foreground" : ""}
                        >
                          {item.title}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </nav>
            </div>
          )}
        </>
      )}
    </LearnerLayout>
  );
}

// The existing AI tutor answers from this course's published material.
function TutorPanel({ courseId }: { courseId: string }) {
  const { askAITutor, loading, error } = useAITutor();
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const ask = async () => {
    const query = question.trim();
    if (!query) return;
    const result = await askAITutor(query, courseId, turns.slice(-10));
    if (result?.response) {
      setTurns([
        ...turns,
        { role: "user", content: query },
        { role: "assistant", content: result.response },
      ]);
      setQuestion("");
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ask the tutor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {turns.map((turn, index) => (
          <p
            key={index}
            className={
              turn.role === "user"
                ? "font-medium"
                : "whitespace-pre-wrap text-muted-foreground"
            }
          >
            {turn.content}
          </p>
        ))}
        {error && (
          <p className="text-sm text-destructive">
            The tutor could not answer right now.
          </p>
        )}
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void ask();
          }}
        >
          <Textarea
            aria-label="Question for the tutor"
            rows={2}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask about this course…"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Ask"
            disabled={loading || !question.trim()}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
