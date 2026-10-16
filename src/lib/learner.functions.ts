import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

// Thin authenticated wrappers; the logic lives in learner.server.ts (server-only).

const CourseInput = z.object({ courseId: z.string().uuid() });
const StepInput = z.object({
  courseId: z.string().uuid(),
  resourceId: z.string().uuid(),
  step: z.enum(["lesson", "question"]),
  answer: z.string().max(4096).optional(),
});
const InviteInput = z.object({
  courseId: z.string().uuid(),
  email: z.string().trim().email().max(320),
});

async function engine<T>(
  run: (server: typeof import("./learner.server"), client: never) => Promise<T>,
) {
  const server = await import("./learner.server");
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  try {
    return await run(server, supabaseAdmin as never);
  } catch (error) {
    // Learner-facing rule violations keep their message; anything else is logged, not leaked.
    if (error instanceof server.LearnerError) throw new Error(error.message);
    console.error("Learner request failed", error);
    throw new Error("Something went wrong. Please try again.");
  }
}

async function requireActiveStaff(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  const { data: role, error } = await supabase
    .from("user_roles")
    .select("role,status")
    .eq("user_id", userId)
    .maybeSingle();
  if (
    error ||
    role?.status !== "active" ||
    !["admin", "content_creator"].includes(role.role)
  ) {
    throw new Error("Active staff access is required.");
  }
}

export const getLearnerHome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) =>
    engine((server, client) => server.learnerHome(client, context.userId)),
  );

export const joinWebCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(CourseInput)
  .handler(({ data, context }) =>
    engine((server, client) =>
      server.joinCourse(client, context.userId, data.courseId),
    ),
  );

export const getWebCourseState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(CourseInput)
  .handler(({ data, context }) =>
    engine((server, client) =>
      server.courseState(client, context.userId, data.courseId),
    ),
  );

export const submitWebStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(StepInput)
  .handler(({ data, context }) =>
    engine((server, client) => server.submitStep(client, context.userId, data)),
  );

export const inviteWebLearner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(InviteInput)
  .handler(async ({ data, context }) => {
    await requireActiveStaff(context.supabase, context.userId);
    return engine((server, client) =>
      server.inviteLearner(client, context.userId, data),
    );
  });

export const listWebLearners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(CourseInput)
  .handler(async ({ data, context }) => {
    await requireActiveStaff(context.supabase, context.userId);
    return engine((server, client) =>
      server.listWebEnrollments(client, data.courseId),
    );
  });
