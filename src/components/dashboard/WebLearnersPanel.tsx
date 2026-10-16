import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { inviteWebLearner, listWebLearners } from "@/lib/learner.functions";

// Staff view of a web course: invite learners by email and follow their progress.
export default function WebLearnersPanel({
  courseId,
  published,
}: {
  courseId: string;
  published: boolean;
}) {
  const list = useServerFn(listWebLearners);
  const invite = useServerFn(inviteWebLearner);
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);
  const queryKey = ["web-learners", courseId];
  const {
    data: learners = [],
    isLoading,
    error,
  } = useQuery({ queryKey, queryFn: () => list({ data: { courseId } }) });
  const inviteMutation = useMutation({
    mutationFn: () => invite({ data: { courseId, email } }),
    onSuccess: async () => {
      setMessage({
        tone: "ok",
        text: `${email} is enrolled.${published ? "" : " They will see the course once it is published."}`,
      });
      setEmail("");
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (e) =>
      setMessage({
        tone: "error",
        text: e instanceof Error ? e.message : "Could not invite this learner.",
      }),
  });

  return (
    <div className="space-y-6">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          inviteMutation.mutate();
        }}
      >
        <Input
          type="email"
          required
          aria-label="Learner email"
          placeholder="learner@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Button
          type="submit"
          disabled={inviteMutation.isPending || !email.trim()}
        >
          {inviteMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="mr-2 h-4 w-4" />
          )}
          Invite
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        The learner needs an account first: they sign up with this email, then
        you invite them.
      </p>
      {message && (
        <p
          role="status"
          className={
            message.tone === "ok"
              ? "text-sm text-primary"
              : "text-sm text-destructive"
          }
        >
          {message.text}
        </p>
      )}

      {isLoading && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading learners…
        </p>
      )}
      {error && (
        <p className="text-destructive">
          {error instanceof Error ? error.message : "Could not load learners."}
        </p>
      )}
      {!isLoading &&
        !error &&
        (learners.length === 0 ? (
          <p className="text-muted-foreground">No web learners yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Learner</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-40">Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {learners.map((learner) => (
                <TableRow key={learner.id}>
                  <TableCell>{learner.email ?? "Unknown account"}</TableCell>
                  <TableCell>
                    {learner.enrolledVia === "self"
                      ? "Self-enrolled"
                      : "Invited"}{" "}
                    · {new Date(learner.startedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        learner.status === "completed" ? "default" : "secondary"
                      }
                    >
                      {learner.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Progress
                      value={learner.progress}
                      aria-label={`${learner.progress}% complete`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}
    </div>
  );
}
