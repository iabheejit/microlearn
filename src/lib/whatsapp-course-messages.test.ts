import { describe, expect, it } from "vitest";
import type { Quiz } from "./course-engine";
import {
  interpretReply,
  questionMessage,
  renderOutputs,
} from "./whatsapp-course-messages";

const context = {
  courseTitle: "WA 101",
  learnerName: "Ann",
  lessonIntro: null,
  timezone: "UTC",
  completionText: "Done! Code ABC",
};
const quiz = (options: string[]): Quiz => ({
  id: "q",
  question: "Which?",
  options,
  correctAnswer: options[0] ?? "x",
  explanation: null,
});
type Interactive = {
  type: string;
  interactive: {
    type: string;
    body: { text: string };
    action: Record<string, unknown>;
  };
};

describe("renderOutputs", () => {
  it("sends a short lesson with Next and Pause buttons and no question", () => {
    const [message] = renderOutputs(
      [
        {
          kind: "lesson",
          lesson: { id: "l", moduleId: "m", title: "Intro", content: "Hello" },
          position: 1,
          total: 3,
          day: 1,
          dayCount: 2,
        },
      ],
      context,
    );
    const payload = message.payload as unknown as Interactive;
    expect(payload.interactive.type).toBe("button");
    expect(payload.interactive.body.text).toContain(
      "Day 1 · Lesson 1/3: Intro",
    );
    expect(payload.interactive.action.buttons).toEqual([
      { type: "reply", reply: { id: "course:next", title: "Next" } },
      { type: "reply", reply: { id: "course:pause", title: "Pause" } },
    ]);
  });

  it("splits a long lesson into text plus a button prompt", () => {
    const messages = renderOutputs(
      [
        {
          kind: "lesson",
          lesson: {
            id: "l",
            moduleId: "m",
            title: "Long",
            content: "x".repeat(2000),
          },
          position: 1,
          total: 1,
          day: 1,
          dayCount: 1,
        },
      ],
      context,
    );
    expect(messages.map((message) => message.payload.type)).toEqual([
      "text",
      "interactive",
    ]);
  });

  it("formats day unlock times in the course timezone", () => {
    const [message] = renderOutputs(
      [{ kind: "day_complete", day: 1, unlockAt: "2026-10-17T03:30:00.000Z" }],
      { ...context, timezone: "Asia/Kolkata" },
    );
    expect(message.content).toMatch(
      /Day 1 complete! Day 2 unlocks .*17 Oct.*09:00/,
    );
  });
});

describe("questionMessage", () => {
  it("uses buttons for up to three short options", () => {
    const payload = questionMessage(quiz(["Yes", "No"]))
      .payload as unknown as Interactive;
    expect(payload.interactive.type).toBe("button");
    expect(payload.interactive.action.buttons).toEqual([
      { type: "reply", reply: { id: "quiz:1", title: "Yes" } },
      { type: "reply", reply: { id: "quiz:2", title: "No" } },
    ]);
  });

  it("uses a list for more or longer options, keeping row titles within limits", () => {
    const payload = questionMessage(
      quiz(["a", "b", "c", "An option far longer than twenty-four characters"]),
    ).payload as unknown as Interactive;
    expect(payload.interactive.type).toBe("list");
    const rows = (
      payload.interactive.action.sections as Array<{
        rows: Array<{ id: string; title: string; description?: string }>;
      }>
    )[0].rows;
    expect(rows[3]).toEqual({
      id: "quiz:4",
      title: "Option 4",
      description: "An option far longer than twenty-four characters",
    });
    expect(rows.every((row) => row.title.length <= 24)).toBe(true);
  });

  it("asks for a typed answer when there are no options", () => {
    expect(questionMessage(quiz([])).payload.type).toBe("text");
  });
});

describe("interpretReply", () => {
  it("maps buttons, list rows and typed words", () => {
    expect(interpretReply({ replyId: "course:next" })).toEqual({
      kind: "next",
    });
    expect(interpretReply({ replyId: "course:pause" })).toEqual({
      kind: "pause",
    });
    expect(interpretReply({ replyId: "course:resume" })).toEqual({
      kind: "resume",
    });
    expect(interpretReply({ replyId: "quiz:2", replyTitle: "No" })).toEqual({
      kind: "answer",
      text: "2",
    });
    expect(interpretReply({ replyId: "Start", replyTitle: "Start" })).toEqual({
      kind: "resume",
    });
    expect(interpretReply({ text: " NEXT " })).toEqual({ kind: "next" });
    expect(interpretReply({ text: "Pause" })).toEqual({ kind: "pause" });
    expect(interpretReply({ text: "b" })).toEqual({
      kind: "answer",
      text: "b",
    });
  });
});
