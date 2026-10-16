import { describe, expect, it } from "vitest";
import { fakeSupabase, type Row } from "@/test/fake-supabase";
import { runCourseScheduler } from "./course-scheduler.server";
import { progressFromReply } from "./whatsapp-progression.server";
import type { ReplyTemplate } from "./whatsapp-template";

const PHONE = "919766072308";
const COURSE = "course-1";

function setup(course: Row = {}) {
  const sent: Array<{ type: unknown; content: string }> = [];
  let failNext = 0;
  const fake = fakeSupabase({
    unique: { whatsapp_progression_events: ["provider_message_id"] },
    rpc: {
      // Mirrors public.apply_whatsapp_step (verified separately against PostgreSQL).
      apply_whatsapp_step: (args) => {
        const enrollment = fake
          .rows("whatsapp_course_enrollments")
          .find((row) => row.id === args.p_enrollment_id);
        if (!enrollment || enrollment.state_version !== args.p_expected_version)
          return { error: { code: "40001", message: "progression_conflict" } };
        const attempt = args.p_attempt as {
          question_id: string;
          answer: string;
          correct: boolean;
        } | null;
        if (attempt)
          fake
            .rows("whatsapp_quiz_attempts")
            .push({ ...attempt, enrollment_id: enrollment.id });
        const state = args.p_state as Row;
        Object.assign(enrollment, state, {
          awaiting_reply: state.status === "active",
          state_version: (enrollment.state_version as number) + 1,
        });
        const event = fake
          .rows("whatsapp_progression_events")
          .find((row) => row.id === args.p_event_id);
        Object.assign(event as Row, {
          outcome: args.p_outcome,
          response_messages: args.p_messages,
        });
        return { data: null };
      },
    },
  });
  fake.rows("courses").push({
    id: COURSE,
    title: "WA 101",
    whatsapp_lesson_intro: null,
    whatsapp_completion_message: null,
    pacing_mode: "fixed_time",
    pacing_gap_days: 1,
    pacing_unlock_time: "09:00",
    pacing_timezone: "UTC",
    pause_reminder_hours: 24,
    whatsapp_nudge_template_name: "course_nudge",
    whatsapp_nudge_template_language: "en_US",
    ...course,
  });
  fake
    .rows("course_modules")
    .push(
      { id: "day1", course_id: COURSE, order_index: 1 },
      { id: "day2", course_id: COURSE, order_index: 2 },
    );
  fake.rows("course_resources").push(
    {
      id: "l1",
      module_id: "day1",
      title: "One",
      content: "First",
      order_index: 1,
    },
    {
      id: "l2",
      module_id: "day1",
      title: "Two",
      content: "Second",
      order_index: 2,
    },
    {
      id: "l3",
      module_id: "day2",
      title: "Three",
      content: "Third",
      order_index: 1,
    },
  );
  fake.rows("course_quiz_questions").push({
    id: "q1",
    resource_id: "l1",
    question: "Pick b",
    options: ["a", "b"],
    correct_answer: "b",
    explanation: "It is b.",
  });
  fake.rows("whatsapp_course_enrollments").push({
    id: "e1",
    course_id: COURSE,
    phone_number: PHONE,
    learner_name: "Ann",
    status: "active",
    awaiting_reply: true,
    current_resource_id: null,
    current_step: "lesson",
    progress_percentage: 0,
    paused_at: null,
    pause_reminder_sent_at: null,
    next_unlock_at: null,
    nudge_sent_at: null,
    completed_at: null,
    state_version: 0,
    updated_at: "2026-10-16",
  });
  const send = async (
    _phone: string,
    payload: Record<string, unknown>,
    content: string,
  ) => {
    if (failNext > 0) {
      failNext -= 1;
      throw new Error("gateway timeout");
    }
    sent.push({
      type:
        (payload.interactive as { type?: string } | undefined)?.type ??
        payload.type,
      content,
    });
    return `wamid.out.${sent.length}`;
  };
  let counter = 0;
  const reply = (
    input: { text?: string; replyId?: string; replyTitle?: string },
    at = "2026-10-16T15:00:00Z",
    id = `wamid.in.${++counter}`,
  ) =>
    progressFromReply(fake.client, PHONE, input, id, {
      send,
      now: new Date(at),
    });
  const enrollment = () => fake.rows("whatsapp_course_enrollments")[0];
  const take = () => sent.splice(0, sent.length);
  return {
    ...fake,
    reply,
    enrollment,
    take,
    send,
    failOnce: () => (failNext = 1),
  };
}

describe("WhatsApp course flow", () => {
  it("sends lessons and questions separately, with Next and Pause", async () => {
    const t = setup();
    expect(await t.reply({ text: "hi" })).toBe("started");
    expect(t.take()).toEqual([
      {
        type: "button",
        content: expect.stringContaining("Day 1 · Lesson 1/3: One"),
      },
    ]);

    expect(await t.reply({ replyId: "course:next" })).toBe("question");
    expect(t.take()).toEqual([
      { type: "button", content: expect.stringContaining("Pick b") },
    ]);

    expect(await t.reply({ replyId: "quiz:1", replyTitle: "a" })).toBe(
      "wrong_answer",
    );
    expect(t.take().map((message) => message.content)).toEqual([
      expect.stringContaining("Not quite. It is b."),
      expect.stringContaining("Pick b"),
    ]);

    expect(await t.reply({ replyId: "quiz:2", replyTitle: "b" })).toBe(
      "advanced",
    );
    expect(t.take().map((message) => message.content)).toEqual([
      expect.stringContaining("Correct! It is b."),
      expect.stringContaining("Lesson 2/3: Two"),
    ]);
    expect(t.rows("whatsapp_quiz_attempts").map((row) => row.correct)).toEqual([
      false,
      true,
    ]);

    expect(await t.reply({ replyId: "course:pause" })).toBe("paused");
    expect(t.take()).toEqual([
      { type: "button", content: expect.stringContaining("Paused") },
    ]);
    expect(await t.reply({ replyId: "course:resume" })).toBe("resumed");
    expect(t.take()).toEqual([
      { type: "button", content: expect.stringContaining("Lesson 2/3: Two") },
    ]);
  });

  it("locks the next day until its unlock time", async () => {
    const t = setup();
    Object.assign(t.enrollment(), { current_resource_id: "l2" });
    expect(await t.reply({ replyId: "course:next" })).toBe("day_complete");
    expect(t.take()[0].content).toMatch(
      /Day 1 complete! Day 2 unlocks .*17 Oct.*09:00/,
    );
    expect(t.enrollment()).toMatchObject({
      current_resource_id: "l3",
      next_unlock_at: "2026-10-17T09:00:00.000Z",
    });

    expect(await t.reply({ text: "next" }, "2026-10-17T08:00:00Z")).toBe(
      "locked",
    );
    expect(t.take()[0].content).toMatch(/Day 2 unlocks/);
    expect(await t.reply({ text: "next" }, "2026-10-17T09:01:00Z")).toBe(
      "unlocked",
    );
    expect(t.take()[0].content).toContain("Day 2 · Lesson 3/3: Three");
  });

  it("never replays a delivered reply and resumes a partly sent one", async () => {
    const t = setup();
    Object.assign(t.enrollment(), {
      current_resource_id: "l1",
      current_step: "question",
    });
    t.failOnce();
    // The correct answer produces two messages; the first send fails before anything is accepted.
    await expect(
      t.reply({ replyId: "quiz:2" }, undefined, "wamid.retry"),
    ).rejects.toThrow("gateway timeout");
    expect(t.enrollment()).toMatchObject({ current_resource_id: "l2" });
    expect(await t.reply({ replyId: "quiz:2" }, undefined, "wamid.retry")).toBe(
      "resent",
    );
    expect(t.take().map((message) => message.content)).toEqual([
      expect.stringContaining("Correct!"),
      expect.stringContaining("Lesson 2/3"),
    ]);
    expect(await t.reply({ replyId: "quiz:2" }, undefined, "wamid.retry")).toBe(
      "duplicate",
    );
    expect(t.take()).toEqual([]);
    expect(t.rows("whatsapp_quiz_attempts")).toHaveLength(1);
  });
});

describe("course scheduler", () => {
  const nudge: ReplyTemplate = {
    id: "t",
    name: "course_nudge",
    language: "en_US",
    body: "Hi {{1}}, your next lesson in {{2}} is ready.",
    variables: ["1", "2"],
  };
  const run = (
    t: ReturnType<typeof setup>,
    at: string,
    templates: ReplyTemplate[] = [nudge],
  ) =>
    runCourseScheduler(t.client, {
      send: t.send,
      templates: async () => templates,
      now: new Date(at),
    });
  const lockedUntil = (t: ReturnType<typeof setup>) =>
    Object.assign(t.enrollment(), {
      current_resource_id: "l3",
      next_unlock_at: "2026-10-17T09:00:00.000Z",
    });

  it("delivers an unlocked day directly while the 24-hour window is open", async () => {
    const t = setup();
    lockedUntil(t);
    t.rows("whatsapp_messages").push({
      phone_number: PHONE,
      direction: "incoming",
      sent_at: "2026-10-16T20:00:00Z",
    });
    expect(await run(t, "2026-10-17T08:55:00Z")).toEqual([]);
    expect(await run(t, "2026-10-17T09:00:00Z")).toEqual([
      { enrollmentId: "e1", action: "unlocked" },
    ]);
    expect(t.take()[0].content).toContain("Lesson 3/3: Three");
    expect(t.enrollment()).toMatchObject({ next_unlock_at: null });
  });

  it("sends the approved nudge template when the window is closed, then the lesson on Start", async () => {
    const t = setup();
    lockedUntil(t);
    expect(await run(t, "2026-10-17T09:00:00Z")).toEqual([
      { enrollmentId: "e1", action: "unlock_nudged" },
    ]);
    expect(t.take()).toEqual([
      {
        type: "template",
        content: "Hi Ann, your next lesson in WA 101 is ready.",
      },
    ]);
    expect(t.enrollment().nudge_sent_at).toBe("2026-10-17T09:00:00.000Z");
    expect(await run(t, "2026-10-17T09:05:00Z")).toEqual([]);
    expect(
      await t.reply(
        { replyId: "Start", replyTitle: "Start" },
        "2026-10-17T10:00:00Z",
      ),
    ).toBe("unlocked");
    expect(t.take()[0].content).toContain("Lesson 3/3: Three");
  });

  it("reports a missing or unapproved nudge template without sending", async () => {
    const t = setup();
    lockedUntil(t);
    expect(await run(t, "2026-10-17T09:00:00Z", [])).toEqual([
      { enrollmentId: "e1", action: "nudge_template_not_approved" },
    ]);
    expect(t.take()).toEqual([]);
  });

  it("reminds a paused learner once after the configured hours", async () => {
    const t = setup();
    Object.assign(t.enrollment(), {
      current_resource_id: "l2",
      paused_at: "2026-10-16T10:00:00Z",
    });
    t.rows("whatsapp_messages").push({
      phone_number: PHONE,
      direction: "incoming",
      sent_at: "2026-10-16T10:00:00Z",
    });
    expect(await run(t, "2026-10-17T09:00:00Z")).toEqual([]);
    expect(await run(t, "2026-10-17T10:00:00Z")).toEqual([
      { enrollmentId: "e1", action: "pause_nudged" },
    ]);
    expect(t.take()[0].type).toBe("template");
    expect(await run(t, "2026-10-17T12:00:00Z")).toEqual([]);
  });

  it("re-sends a stuck delivery", async () => {
    const t = setup();
    t.failOnce();
    await expect(
      t.reply({ text: "hi" }, "2026-10-16T15:00:00Z"),
    ).rejects.toThrow();
    const event = t.rows("whatsapp_progression_events")[0];
    event.created_at = "2026-10-16T15:00:00Z";
    expect(await run(t, "2026-10-16T15:10:00Z")).toEqual([
      { enrollmentId: "e1", action: "redelivered" },
    ]);
    expect(t.take()[0].content).toContain("Lesson 1/3");
    expect(event.status).toBe("completed");
  });
});
