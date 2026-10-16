import { describe, expect, it } from "vitest";
import {
  computeUnlockAt,
  decideStep,
  type EnrollmentState,
  type Input,
  type Lesson,
  type Pacing,
  type Quiz,
} from "./course-engine";

const lessons: Lesson[] = [
  { id: "l1", moduleId: "day1", title: "One", content: "First" },
  { id: "l2", moduleId: "day1", title: "Two", content: "Second" },
  { id: "l3", moduleId: "day2", title: "Three", content: "Third" },
];
const quiz: Quiz = {
  id: "q1",
  question: "Pick b",
  options: ["a", "b"],
  correctAnswer: "b",
  explanation: "It is b.",
};
const immediate: Pacing = {
  mode: "immediate",
  gapDays: 1,
  unlockTime: "09:00",
  timezone: "UTC",
};
const nextMorning: Pacing = {
  mode: "fixed_time",
  gapDays: 1,
  unlockTime: "09:00",
  timezone: "UTC",
};
const fresh: EnrollmentState = {
  status: "active",
  currentResourceId: null,
  step: "lesson",
  progress: 0,
  pausedAt: null,
  pauseReminderSentAt: null,
  nextUnlockAt: null,
  nudgeSentAt: null,
  completedAt: null,
};
const now = new Date("2026-10-16T15:00:00Z");
const next: Input = { kind: "next" };
const decide = (
  state: EnrollmentState,
  input: Input,
  options: { quiz?: Quiz | null; pacing?: Pacing; at?: Date } = {},
) =>
  decideStep({
    state,
    lessons,
    quiz: options.quiz ?? null,
    pacing: options.pacing ?? immediate,
    input,
    now: options.at ?? now,
  });

describe("decideStep", () => {
  it("sends the first lesson on any first message", () => {
    const result = decide(fresh, { kind: "answer", text: "hi" });
    expect(result.outcome).toBe("started");
    expect(result.state).toMatchObject({
      currentResourceId: "l1",
      step: "lesson",
    });
    expect(result.outputs).toEqual([
      expect.objectContaining({
        kind: "lesson",
        position: 1,
        total: 3,
        day: 1,
        dayCount: 2,
      }),
    ]);
  });

  it("separates the lesson from its question: Next reveals the question", () => {
    const reading = { ...fresh, currentResourceId: "l1" };
    const result = decide(reading, next, { quiz });
    expect(result.outcome).toBe("question");
    expect(result.state.step).toBe("question");
    expect(result.outputs).toEqual([{ kind: "question", quiz }]);
  });

  it("asks for Next instead of guessing when a learner types during a lesson", () => {
    const result = decide(
      { ...fresh, currentResourceId: "l1" },
      { kind: "answer", text: "b" },
      { quiz },
    );
    expect(result.outcome).toBe("hint");
    expect(result.state.step).toBe("lesson");
    expect(result.attempt).toBeNull();
  });

  it("records a wrong answer, explains it and asks again", () => {
    const asking = {
      ...fresh,
      currentResourceId: "l1",
      step: "question" as const,
    };
    const result = decide(asking, { kind: "answer", text: "1" }, { quiz });
    expect(result.outcome).toBe("wrong_answer");
    expect(result.state).toEqual(asking);
    expect(result.attempt).toEqual({
      questionId: "q1",
      answer: "1",
      correct: false,
    });
    expect(result.outputs.map((output) => output.kind)).toEqual([
      "feedback",
      "question",
    ]);
  });

  it("moves to the next lesson after a correct answer", () => {
    const result = decide(
      { ...fresh, currentResourceId: "l1", step: "question" },
      { kind: "answer", text: "2" },
      { quiz },
    );
    expect(result.outcome).toBe("advanced");
    expect(result.state).toMatchObject({
      currentResourceId: "l2",
      step: "lesson",
      progress: 33,
    });
    expect(result.outputs.map((output) => output.kind)).toEqual([
      "feedback",
      "lesson",
    ]);
  });

  it("goes straight to the next lesson on Next when a lesson has no question", () => {
    const result = decide({ ...fresh, currentResourceId: "l1" }, next);
    expect(result.outcome).toBe("advanced");
    expect(result.state.currentResourceId).toBe("l2");
  });

  it("pauses, stays paused on repeated Pause, and resumes on the same item", () => {
    const asking = {
      ...fresh,
      currentResourceId: "l1",
      step: "question" as const,
    };
    const paused = decide(asking, { kind: "pause" }, { quiz });
    expect(paused.outcome).toBe("paused");
    expect(paused.state.pausedAt).toBe(now.toISOString());
    expect(decide(paused.state, { kind: "pause" }, { quiz }).outcome).toBe(
      "paused",
    );
    const resumed = decide(
      { ...paused.state, pauseReminderSentAt: now.toISOString() },
      { kind: "resume" },
      { quiz },
    );
    expect(resumed.outcome).toBe("resumed");
    expect(resumed.state).toMatchObject({
      pausedAt: null,
      pauseReminderSentAt: null,
      step: "question",
    });
    expect(resumed.outputs).toEqual([{ kind: "question", quiz }]);
  });

  it("locks the next day after finishing a day, then unlocks it once due", () => {
    const done = decide({ ...fresh, currentResourceId: "l2" }, next, {
      pacing: nextMorning,
    });
    expect(done.outcome).toBe("day_complete");
    expect(done.state).toMatchObject({
      currentResourceId: "l3",
      step: "lesson",
      nextUnlockAt: "2026-10-17T09:00:00.000Z",
    });
    expect(done.outputs).toEqual([
      { kind: "day_complete", day: 1, unlockAt: "2026-10-17T09:00:00.000Z" },
    ]);

    const early = decide(done.state, next, {
      pacing: nextMorning,
      at: new Date("2026-10-17T08:59:00Z"),
    });
    expect(early.outcome).toBe("locked");
    expect(early.state).toBe(done.state);
    expect(early.outputs).toEqual([
      { kind: "locked", day: 2, unlockAt: "2026-10-17T09:00:00.000Z" },
    ]);

    const due = decide(
      { ...done.state, nudgeSentAt: "x" },
      { kind: "resume" },
      { pacing: nextMorning, at: new Date("2026-10-17T09:05:00Z") },
    );
    expect(due.outcome).toBe("unlocked");
    expect(due.state).toMatchObject({
      nextUnlockAt: null,
      nudgeSentAt: null,
      currentResourceId: "l3",
    });
    expect(due.outputs).toEqual([
      expect.objectContaining({ kind: "lesson", position: 3, day: 2 }),
    ]);
  });

  it("does not lock days in immediate mode", () => {
    expect(decide({ ...fresh, currentResourceId: "l2" }, next).outcome).toBe(
      "advanced",
    );
  });

  it("completes after the last lesson", () => {
    const result = decide({ ...fresh, currentResourceId: "l3" }, next);
    expect(result.outcome).toBe("completed");
    expect(result.state).toMatchObject({
      status: "completed",
      progress: 100,
      completedAt: now.toISOString(),
    });
  });

  it("ignores inactive enrollments and empty courses", () => {
    expect(decide({ ...fresh, status: "completed" }, next).outputs).toEqual([]);
    expect(
      decideStep({
        state: fresh,
        lessons: [],
        quiz: null,
        pacing: immediate,
        input: next,
        now,
      }).outcome,
    ).toBe("no_lessons");
  });
});

describe("computeUnlockAt", () => {
  it("unlocks at a local time on a later calendar day", () => {
    const pacing: Pacing = {
      mode: "fixed_time",
      gapDays: 1,
      unlockTime: "09:00",
      timezone: "Asia/Kolkata",
    };
    // 23:30 IST on 16 Oct is still 16 Oct locally, so the next day is 17 Oct 09:00 IST = 03:30 UTC.
    expect(
      computeUnlockAt(pacing, new Date("2026-10-16T18:00:00Z"))?.toISOString(),
    ).toBe("2026-10-17T03:30:00.000Z");
    // 00:30 IST on 17 Oct (19:00 UTC on the 16th) is already the 17th locally: unlock on the 18th.
    expect(
      computeUnlockAt(pacing, new Date("2026-10-16T19:00:00Z"))?.toISOString(),
    ).toBe("2026-10-18T03:30:00.000Z");
  });

  it("handles daylight saving changes", () => {
    const pacing: Pacing = {
      mode: "fixed_time",
      gapDays: 1,
      unlockTime: "09:00",
      timezone: "America/New_York",
    };
    // US clocks fall back on 1 Nov 2026: 09:00 EST on 2 Nov is 14:00 UTC.
    expect(
      computeUnlockAt(pacing, new Date("2026-11-01T12:00:00Z"))?.toISOString(),
    ).toBe("2026-11-02T14:00:00.000Z");
  });

  it("supports N days after finishing and immediate mode", () => {
    const finished = new Date("2026-10-16T15:00:00Z");
    expect(
      computeUnlockAt(
        { ...nextMorning, mode: "after_completion", gapDays: 2 },
        finished,
      )?.toISOString(),
    ).toBe("2026-10-18T15:00:00.000Z");
    expect(computeUnlockAt(immediate, finished)).toBeNull();
  });

  it("falls back safely on invalid settings", () => {
    const pacing: Pacing = {
      mode: "fixed_time",
      gapDays: 0,
      unlockTime: "25:99",
      timezone: "Not/AZone",
    };
    expect(
      computeUnlockAt(pacing, new Date("2026-10-16T15:00:00Z"))?.toISOString(),
    ).toBe("2026-10-17T09:00:00.000Z");
  });
});
