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
const ANN = "user-ann";

function setup(course: Row = {}, rpcError?: { code: string; message: string }) {
  const calls: Row[] = [];
  const fake = fakeSupabase({
    rpc: {
      apply_web_progression: (args) => {
        calls.push(args);
        return rpcError
          ? { error: rpcError }
          : {
              data: {
                completed: args.p_complete,
                certificate_code: args.p_complete ? "ABC123" : null,
              },
            };
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
    ...course,
  });
  fake
    .rows("course_modules")
    .push({ id: "m1", course_id: COURSE, order_index: 1 });
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
      progress_percentage: 0,
      updated_at: "2026-01-02",
      ...extra,
    });
  return { ...fake, calls, enroll };
}

describe("courseState", () => {
  it("starts on the first lesson and never sends the answer key", async () => {
    const { client, enroll } = setup();
    enroll();
    const state = await courseState(client, ANN, COURSE);
    expect(state.state).toBe("learning");
    if (state.state !== "learning") return;
    expect(state.lesson).toMatchObject({
      id: L1,
      position: 1,
      quiz: { question: "Pick b", options: ["a", "b"] },
    });
    expect(JSON.stringify(state)).not.toMatch(/correct_answer|It is b/);
  });

  it("hides unpublished and non-web courses", async () => {
    for (const course of [
      { is_published: false },
      { delivery_channel: "whatsapp" },
    ]) {
      const { client, enroll } = setup(course);
      enroll();
      await expect(courseState(client, ANN, COURSE)).rejects.toBeInstanceOf(
        LearnerError,
      );
      expect((await learnerHome(client, ANN)).enrollments).toEqual([]);
    }
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

describe("submitStep", () => {
  it("records a wrong answer without advancing and returns the explanation", async () => {
    const { client, enroll, calls } = setup();
    enroll();
    expect(
      await submitStep(client, ANN, {
        courseId: COURSE,
        resourceId: L1,
        answer: "1",
      }),
    ).toEqual({ status: "incorrect", explanation: "It is b." });
    expect(calls[0]).toMatchObject({
      p_question_id: "q1",
      p_is_correct: false,
      p_advance: false,
      p_complete: false,
    });
  });

  it("advances on a correct answer and completes after the last lesson", async () => {
    const { client, enroll, calls } = setup();
    enroll();
    expect(
      await submitStep(client, ANN, {
        courseId: COURSE,
        resourceId: L1,
        answer: "2",
      }),
    ).toEqual({ status: "advanced" });
    expect(calls[0]).toMatchObject({
      p_expected_resource_id: null,
      p_is_correct: true,
      p_advance: true,
      p_next_resource_id: L2,
      p_progress: 50,
    });

    const { client: last, enroll: enrollLast } = setup();
    enrollLast({ current_resource_id: L2 });
    expect(
      await submitStep(last, ANN, { courseId: COURSE, resourceId: L2 }),
    ).toEqual({ status: "completed", certificateCode: "ABC123" });
  });

  it("treats a lesson the learner has moved past, or a lost race, as stale", async () => {
    const { client, enroll, calls } = setup();
    enroll({ current_resource_id: L2 });
    expect(
      await submitStep(client, ANN, {
        courseId: COURSE,
        resourceId: L1,
        answer: "2",
      }),
    ).toEqual({ status: "stale" });
    expect(calls).toHaveLength(0);

    const raced = setup({}, { code: "40001", message: "progression_conflict" });
    raced.enroll();
    expect(
      await submitStep(raced.client, ANN, {
        courseId: COURSE,
        resourceId: L1,
        answer: "2",
      }),
    ).toEqual({ status: "stale" });
  });

  it("requires an answer for quiz lessons", async () => {
    const { client, enroll } = setup();
    enroll();
    await expect(
      submitStep(client, ANN, { courseId: COURSE, resourceId: L1 }),
    ).rejects.toBeInstanceOf(LearnerError);
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
