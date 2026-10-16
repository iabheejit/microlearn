import { describe, expect, it } from "vitest";
import { fakeSupabase, type Row } from "@/test/fake-supabase";
import {
  courseState,
  inviteLearner,
  joinCourse,
  LearnerError,
  learnerHome,
  submitStep,
} from "./learner.server";

const COURSE = "10000000-0000-0000-0000-000000000001";
const L1 = "30000000-0000-0000-0000-000000000001";
const L2 = "30000000-0000-0000-0000-000000000002";
const L3 = "30000000-0000-0000-0000-000000000003";
const ANN = "user-ann";
const NOW = new Date("2026-10-16T15:00:00Z");

function setup(course: Row = {}, rpcError?: { code: string; message: string }) {
  const calls: Row[] = [];
  const fake = fakeSupabase({
    rpc: {
      // Mirrors public.apply_web_step (verified separately against PostgreSQL).
      apply_web_step: (args) => {
        calls.push(args);
        if (rpcError) return { error: rpcError };
        const row = fake
          .rows("web_course_enrollments")
          .find((item) => item.id === args.p_enrollment_id);
        if (!row || row.state_version !== args.p_expected_version)
          return { error: { code: "40001", message: "progression_conflict" } };
        Object.assign(row, args.p_state, {
          state_version: (row.state_version as number) + 1,
        });
        const completed = (args.p_state as Row).status === "completed";
        return { data: { certificate_code: completed ? "ABC123" : null } };
      },
      find_auth_user_id_by_email: (args) => ({
        data: args.p_email === "ann@example.com" ? ANN : null,
      }),
    },
    users: { [ANN]: "ann@example.com" },
  });
  fake.rows("courses").push({
    id: COURSE,
    title: "Web 101",
    description: "Intro",
    thumbnail_url: null,
    created_at: "2026-01-01",
    is_published: true,
    delivery_channel: "web",
    web_enrollment_mode: "invite",
    pacing_mode: "fixed_time",
    pacing_gap_days: 1,
    pacing_unlock_time: "09:00",
    pacing_timezone: "UTC",
    ...course,
  });
  fake
    .rows("course_modules")
    .push(
      { id: "m1", course_id: COURSE, order_index: 1 },
      { id: "m2", course_id: COURSE, order_index: 2 },
    );
  fake.rows("course_resources").push(
    {
      id: L1,
      module_id: "m1",
      title: "One",
      content: "First",
      order_index: 1,
    },
    {
      id: L2,
      module_id: "m1",
      title: "Two",
      content: "Second",
      order_index: 2,
    },
    {
      id: L3,
      module_id: "m2",
      title: "Three",
      content: "Third",
      order_index: 1,
    },
  );
  fake.rows("course_quiz_questions").push({
    id: "q1",
    resource_id: L1,
    question: "Pick b",
    options: ["a", "b"],
    correct_answer: "b",
    explanation: "It is b.",
  });
  const enroll = (extra: Row = {}) =>
    fake.rows("web_course_enrollments").push({
      id: "e1",
      course_id: COURSE,
      user_id: ANN,
      status: "active",
      current_resource_id: null,
      current_step: "lesson",
      progress_percentage: 0,
      next_unlock_at: null,
      completed_at: null,
      state_version: 0,
      updated_at: "2026-01-02",
      ...extra,
    });
  const step = (
    resourceId: string,
    stepName: "lesson" | "question",
    answer?: string,
    at = NOW,
  ) =>
    submitStep(
      fake.client,
      ANN,
      { courseId: COURSE, resourceId, step: stepName, answer },
      at,
    );
  return { ...fake, calls, enroll, step };
}

describe("courseState", () => {
  it("shows the lesson first, then the question without the answer key", async () => {
    const { client, enroll, step } = setup();
    enroll();
    const reading = await courseState(client, ANN, COURSE, NOW);
    expect(reading).toMatchObject({
      state: "learning",
      lesson: { id: L1, position: 1, day: 1, dayCount: 2, content: "First" },
    });
    expect(await step(L1, "lesson")).toEqual({ status: "question" });
    const asking = await courseState(client, ANN, COURSE, NOW);
    expect(asking).toMatchObject({
      state: "question",
      quiz: { question: "Pick b", options: ["a", "b"] },
    });
    expect(JSON.stringify(asking)).not.toMatch(
      /correct_answer|correctAnswer|It is b/,
    );
  });

  it("hides unpublished and non-web courses", async () => {
    for (const course of [
      { is_published: false },
      { delivery_channel: "whatsapp" },
    ]) {
      const { client, enroll } = setup(course);
      enroll();
      await expect(
        courseState(client, ANN, COURSE, NOW),
      ).rejects.toBeInstanceOf(LearnerError);
      expect((await learnerHome(client, ANN)).enrollments).toEqual([]);
    }
  });
});

describe("submitStep", () => {
  it("records a wrong answer and keeps the question", async () => {
    const { enroll, step, calls } = setup();
    enroll({ current_resource_id: L1, current_step: "question" });
    expect(await step(L1, "question", "1")).toEqual({
      status: "incorrect",
      explanation: "It is b.",
    });
    expect(calls[0]).toMatchObject({
      p_attempt: { question_id: "q1", answer: "1", correct: false },
      p_state: { current_resource_id: L1, current_step: "question" },
    });
  });

  it("advances on a correct answer, locks the next day, then unlocks it on time", async () => {
    const { client, enroll, step, rows } = setup();
    enroll({ current_resource_id: L1, current_step: "question" });
    expect(await step(L1, "question", "2")).toEqual({
      status: "correct",
      explanation: "It is b.",
      next: "advanced",
    });
    expect(await step(L2, "lesson")).toEqual({
      status: "day_complete",
      unlockAt: "2026-10-17T09:00:00.000Z",
      timezone: "UTC",
    });
    expect(rows("web_course_enrollments")[0]).toMatchObject({
      current_resource_id: L3,
      next_unlock_at: "2026-10-17T09:00:00.000Z",
    });

    expect(
      await courseState(client, ANN, COURSE, new Date("2026-10-17T08:00:00Z")),
    ).toMatchObject({ state: "locked", unlock: { day: 2 } });
    expect(
      await step(L3, "lesson", undefined, new Date("2026-10-17T08:00:00Z")),
    ).toEqual({ status: "stale" });
    const later = new Date("2026-10-17T09:30:00Z");
    expect(await courseState(client, ANN, COURSE, later)).toMatchObject({
      state: "learning",
      lesson: { id: L3, day: 2 },
    });
    expect(await step(L3, "lesson", undefined, later)).toEqual({
      status: "completed",
      certificateCode: "ABC123",
    });
  });

  it("treats a lesson or step the learner has moved past, or a lost race, as stale", async () => {
    const { enroll, step, calls } = setup();
    enroll({ current_resource_id: L2 });
    expect(await step(L1, "question", "2")).toEqual({ status: "stale" });
    expect(await step(L2, "question", "2")).toEqual({ status: "stale" });
    expect(calls).toHaveLength(0);

    const raced = setup({}, { code: "40001", message: "progression_conflict" });
    raced.enroll();
    expect(await raced.step(L1, "lesson")).toEqual({ status: "stale" });
  });

  it("requires an answer for questions", async () => {
    const { enroll, step } = setup();
    enroll({ current_resource_id: L1, current_step: "question" });
    await expect(step(L1, "question")).rejects.toBeInstanceOf(LearnerError);
  });
});

describe("joinCourse", () => {
  it("refuses invite-only courses", async () => {
    const { client } = setup();
    await expect(joinCourse(client, ANN, COURSE)).rejects.toBeInstanceOf(
      LearnerError,
    );
  });

  it("lets learners join open courses once", async () => {
    const { client, rows } = setup({ web_enrollment_mode: "open" });
    expect(
      (await learnerHome(client, ANN)).catalog.map((course) => course.courseId),
    ).toEqual([COURSE]);
    await joinCourse(client, ANN, COURSE);
    await joinCourse(client, ANN, COURSE);
    expect(rows("web_course_enrollments")).toHaveLength(1);
    expect(rows("web_course_enrollments")[0]).toMatchObject({
      enrolled_via: "self",
    });
    expect((await learnerHome(client, ANN)).catalog).toEqual([]);
  });
});

describe("inviteLearner", () => {
  it("enrolls an existing account by email, once", async () => {
    const { client, rows } = setup();
    await inviteLearner(client, "staff-1", {
      courseId: COURSE,
      email: "ann@example.com",
    });
    expect(rows("web_course_enrollments")[0]).toMatchObject({
      user_id: ANN,
      enrolled_via: "invite",
      enrolled_by: "staff-1",
    });
    await expect(
      inviteLearner(client, "staff-1", {
        courseId: COURSE,
        email: "ann@example.com",
      }),
    ).rejects.toThrow(/already enrolled/);
  });

  it("rejects unknown emails and non-web courses", async () => {
    await expect(
      inviteLearner(setup().client, "staff-1", {
        courseId: COURSE,
        email: "nobody@example.com",
      }),
    ).rejects.toThrow(/No account/);
    await expect(
      inviteLearner(setup({ delivery_channel: "whatsapp" }).client, "staff-1", {
        courseId: COURSE,
        email: "ann@example.com",
      }),
    ).rejects.toThrow(/web courses/);
  });
});
