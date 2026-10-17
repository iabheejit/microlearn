import { describe, expect, it } from "vitest";
import type { Quiz } from "./course-engine";
import {
  documentMessage,
  HELP_IDS,
  interpretReply,
  progressBar,
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
    expect(payload.interactive.body.text).toContain("*Day 1 · Intro*");
    expect(payload.interactive.body.text).toContain("▰▰▰▱▱▱▱▱ 1 of 3");
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
      [
        {
          kind: "day_complete",
          day: 1,
          unlockAt: "2026-10-17T03:30:00.000Z",
          nextTitle: "Make it stick",
        },
      ],
      { ...context, timezone: "Asia/Kolkata" },
    );
    expect(message.content).toContain("Day 1 done!");
    expect(message.content).toContain("Make it stick");
    expect(message.content).toMatch(/unlocks .*17 Oct.*09:00/);
  });

  it("welcomes a new learner with what to expect", () => {
    const [message] = renderOutputs(
      [{ kind: "welcome", dayCount: 3, lessonCount: 6 }],
      context,
    );
    expect(message.content).toContain("Welcome to *WA 101*, Ann!");
    expect(message.content).toContain("3 days · 6 short lessons");
    expect(message.content).toContain("Pause");
    expect(message.content).toContain("certificate");
  });

  it("rotates the praise line and keeps the explanation", () => {
    const lines = new Set(
      ["a", "bb", "ccc"].map(
        (explanation) =>
          renderOutputs(
            [{ kind: "feedback", correct: true, explanation }],
            context,
          )[0].content,
      ),
    );
    expect(lines.size).toBe(3);
    const [message] = renderOutputs(
      [{ kind: "feedback", correct: true, explanation: "Because b." }],
      context,
    );
    expect(message.content).toContain("Because b.");
    expect(message.content).toMatch(/^✅/);
  });

  it("encourages one more go after a first miss", () => {
    const [message] = renderOutputs(
      [{ kind: "feedback", correct: false, explanation: "Think b." }],
      context,
    );
    expect(message.content).toContain("Not quite.");
    expect(message.content).toContain("one more go");
  });

  it("shows the answer when the learner has used their tries", () => {
    const [message] = renderOutputs(
      [
        {
          kind: "feedback",
          correct: false,
          explanation: "It is b.",
          revealed: "b",
        },
      ],
      context,
    );
    expect(message.content).toContain("The answer was *b*");
    expect(message.content).toContain("It is b.");
    expect(message.content).toContain("keep going");
  });

  it("completes with text, score, certificate document and closing buttons", () => {
    const messages = renderOutputs([{ kind: "completed" }], {
      ...context,
      scoreLine: "🏆 4/5 correct on the first try",
      certificate: {
        pdfUrl: "https://app.test/api/public/certificates/ABC",
        verifyUrl: "https://app.test/verify/ABC",
        filename: "Certificate - WA 101.pdf",
      },
    });
    expect(messages.map((message) => message.payload.type)).toEqual([
      "text",
      "document",
      "interactive",
    ]);
    expect(messages[0].content).toBe(
      "Done! Code ABC\n\n🏆 4/5 correct on the first try",
    );
    expect(messages[1].payload).toEqual({
      type: "document",
      document: {
        link: "https://app.test/api/public/certificates/ABC",
        filename: "Certificate - WA 101.pdf",
        caption:
          "🎓 Your certificate. Anyone can verify it at https://app.test/verify/ABC",
      },
    });
    const buttons = (messages[2].payload as unknown as Interactive).interactive
      .action.buttons;
    expect(buttons).toEqual([
      {
        type: "reply",
        reply: { id: HELP_IDS.certificate, title: "My certificate" },
      },
      { type: "reply", reply: { id: HELP_IDS.courses, title: "My courses" } },
      {
        type: "reply",
        reply: { id: HELP_IDS.human, title: "Talk to a person" },
      },
    ]);
  });

  it("completes without a document or certificate button when there is no certificate link", () => {
    const messages = renderOutputs([{ kind: "completed" }], context);
    expect(messages.map((message) => message.payload.type)).toEqual([
      "text",
      "interactive",
    ]);
    expect(messages[0].content).toBe("Done! Code ABC");
    const buttons = (messages[1].payload as unknown as Interactive).interactive
      .action.buttons as Array<{ reply: { id: string } }>;
    expect(buttons.map((button) => button.reply.id)).toEqual([
      HELP_IDS.courses,
      HELP_IDS.human,
    ]);
  });
});

describe("progressBar", () => {
  it("fills proportionally and always shows some progress", () => {
    expect(progressBar(1, 8)).toBe("▰▱▱▱▱▱▱▱ 1 of 8");
    expect(progressBar(4, 8)).toBe("▰▰▰▰▱▱▱▱ 4 of 8");
    expect(progressBar(8, 8)).toBe("▰▰▰▰▰▰▰▰ 8 of 8");
    expect(progressBar(1, 100)).toBe("▰▱▱▱▱▱▱▱ 1 of 100");
  });
});

describe("documentMessage", () => {
  it("builds a document payload with readable Chat History content", () => {
    const message = documentMessage("https://x.test/a.pdf", "a.pdf", "Hello");
    expect(message.payload).toEqual({
      type: "document",
      document: {
        link: "https://x.test/a.pdf",
        filename: "a.pdf",
        caption: "Hello",
      },
    });
    expect(message.content).toBe("📄 a.pdf\nHello");
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
