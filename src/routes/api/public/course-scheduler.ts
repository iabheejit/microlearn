import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Called every 5 minutes by pg_cron (private.dispatch_course_scheduler). The secret lives only in
// Supabase Vault; it is checked in the database, never compared against a public API key.
export const Route = createFileRoute("/api/public/course-scheduler")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-course-scheduler-secret") ?? "";
        if (secret.length < 32) return json({ error: "Unauthorized" }, 401);
        const { serviceClient } = await import("@/lib/whatsapp-webhook.server");
        const client = serviceClient();
        const { data: authorized, error } = await client.rpc(
          "course_scheduler_secret_matches",
          { p_secret: secret },
        );
        if (error || authorized !== true)
          return json({ error: "Unauthorized" }, 401);

        const { runCourseScheduler } =
          await import("@/lib/course-scheduler.server");
        const { approvedReplyTemplates, sendAutomatedWhatsApp } =
          await import("@/lib/whatsapp-send.server");
        try {
          const results = await runCourseScheduler(client, {
            send: sendAutomatedWhatsApp,
            templates: () =>
              approvedReplyTemplates({ allowQuickReplies: true }),
            now: new Date(),
          });
          return json({ ok: true, results });
        } catch (error) {
          console.error("Course scheduler run failed", error);
          return json({ error: "Scheduler run failed" }, 500);
        }
      },
    },
  },
});
