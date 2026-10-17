import {
  formatUnlockTime,
  type Input,
  type LessonOutput,
  type Output,
  type Quiz,
} from "./course-engine";

// Pure WhatsApp rendering of course-engine outputs. Limits are Meta's interactive-message limits.
const BODY_MAX = 1024;
const TEXT_MAX = 4096;
const BUTTON_TITLE_MAX = 20;
const ROW_TITLE_MAX = 24;
const ROW_DESCRIPTION_MAX = 72;

export const BUTTON_IDS = {
  next: "course:next",
  pause: "course:pause",
  resume: "course:resume",
} as const;
/** Buttons on the help menu and the closing messages; routed by whatsapp-fallback.server.ts. */
export const HELP_IDS = {
  courses: "help:courses",
  human: "help:human",
  certificate: "help:certificate",
  join: "help:join",
} as const;
const ANSWER_PREFIX = "quiz:";

/** One message to send: the Graph API payload plus readable text for Chat History. */
export type OutgoingMessage = {
  payload: Record<string, unknown>;
  content: string;
};

export type Reply = { id: string; title: string };

const truncate = (value: string, max: number) =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`;

export const textMessage = (body: string): OutgoingMessage => ({
  payload: { type: "text", text: { body: truncate(body, TEXT_MAX) } },
  content: truncate(body, TEXT_MAX),
});

/** A file the learner can open and keep; `link` must be publicly reachable by WhatsApp. */
export const documentMessage = (
  link: string,
  filename: string,
  caption: string,
): OutgoingMessage => ({
  payload: {
    type: "document",
    document: {
      link,
      filename,
      caption: truncate(caption, BODY_MAX),
    },
  },
  content: `📄 ${filename}\n${truncate(caption, BODY_MAX)}`,
});

export const buttonMessage = (
  body: string,
  buttons: Reply[],
): OutgoingMessage => ({
  payload: {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: truncate(body, BODY_MAX) },
      action: {
        buttons: buttons.map((button) => ({
          type: "reply",
          reply: {
            id: button.id,
            title: truncate(button.title, BUTTON_TITLE_MAX),
          },
        })),
      },
    },
  },
  content: `${truncate(body, BODY_MAX)}\n${buttons.map((button) => `[${button.title}]`).join(" ")}`,
});

const SEGMENTS = 8;
/** `▰▰▰▱▱▱▱▱ 3 of 8` — how far through the course the learner is. */
export const progressBar = (position: number, total: number) => {
  const filled = Math.max(
    1,
    Math.min(SEGMENTS, Math.round((position / Math.max(total, 1)) * SEGMENTS)),
  );
  return `${"▰".repeat(filled)}${"▱".repeat(SEGMENTS - filled)} ${position} of ${total}`;
};

const CORRECT_LINES = ["✅ Correct!", "✅ Nice one!", "✅ Spot on!"];

const NEXT: Reply = { id: BUTTON_IDS.next, title: "Next" };
const PAUSE: Reply = { id: BUTTON_IDS.pause, title: "Pause" };
const RESUME: Reply = { id: BUTTON_IDS.resume, title: "Resume" };

function lessonMessages(
  output: LessonOutput,
  intro: string | null,
): OutgoingMessage[] {
  const heading = `*Day ${output.day} · ${output.lesson.title}*\n${progressBar(output.position, output.total)}`;
  const text = [intro?.trim(), heading, output.lesson.content]
    .filter(Boolean)
    .join("\n\n");
  // Short lessons carry their own buttons; long ones are sent as text followed by the buttons.
  if (text.length <= BODY_MAX) return [buttonMessage(text, [NEXT, PAUSE])];
  return [
    textMessage(text),
    buttonMessage("Tap Next when you're ready, or Pause to take a break.", [
      NEXT,
      PAUSE,
    ]),
  ];
}

export function questionMessage(quiz: Quiz): OutgoingMessage {
  const options = quiz.options;
  const fitsButtons =
    options.length >= 1 &&
    options.length <= 3 &&
    options.every((option) => option.length <= BUTTON_TITLE_MAX);
  if (fitsButtons) {
    return buttonMessage(
      `❓ ${quiz.question}`,
      options.map((option, index) => ({
        id: `${ANSWER_PREFIX}${index + 1}`,
        title: option,
      })),
    );
  }
  if (options.length >= 1 && options.length <= 10) {
    const numbered = options
      .map((option, index) => `${index + 1}. ${option}`)
      .join("\n");
    const body = `❓ ${quiz.question}\n\n${numbered}\n\nTap "Choose answer" or type the number.`;
    const rows = options.map((option, index) => ({
      id: `${ANSWER_PREFIX}${index + 1}`,
      title: option.length <= ROW_TITLE_MAX ? option : `Option ${index + 1}`,
      ...(option.length > ROW_TITLE_MAX
        ? { description: truncate(option, ROW_DESCRIPTION_MAX) }
        : {}),
    }));
    return {
      payload: {
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: truncate(body, BODY_MAX) },
          action: {
            button: "Choose answer",
            sections: [{ title: "Answers", rows }],
          },
        },
      },
      content: truncate(body, BODY_MAX),
    };
  }
  // Free-text answers (or more than 10 options): the learner types the answer.
  const numbered = options.length
    ? `\n\n${options.map((option, index) => `${index + 1}. ${option}`).join("\n")}`
    : "";
  return textMessage(
    `❓ ${quiz.question}${numbered}\n\nReply with your answer.`,
  );
}

export type RenderContext = {
  courseTitle: string;
  learnerName: string;
  lessonIntro: string | null;
  timezone: string;
  /** Completion text with the certificate code already filled in. */
  completionText: string;
  /** Appended to the completion message, e.g. "🏆 4/5 correct on the first try". */
  scoreLine?: string;
  /** Present when the learner finished and has a certificate to send. */
  certificate?: { pdfUrl: string; verifyUrl: string; filename: string };
};

export function renderOutputs(
  outputs: Output[],
  context: RenderContext,
): OutgoingMessage[] {
  return outputs.flatMap((output): OutgoingMessage[] => {
    switch (output.kind) {
      case "lesson":
        return lessonMessages(output, context.lessonIntro);
      case "question":
        return [questionMessage(output.quiz)];
      case "welcome":
        return [
          textMessage(
            [
              `👋 Welcome to *${context.courseTitle}*, ${context.learnerName}!`,
              `📅 ${output.dayCount} ${output.dayCount === 1 ? "day" : "days"} · ${output.lessonCount} short lessons, about 3 minutes a day\n▶️ Read a lesson, tap *Next*, then answer one quick question\n⏸️ Tap *Pause* any time and pick up later\n🎓 Finish to earn a certificate`,
              "Let's start with Day 1 👇",
            ].join("\n\n"),
          ),
        ];
      case "feedback": {
        const explanation = output.explanation ? ` ${output.explanation}` : "";
        if (output.revealed !== undefined)
          return [
            textMessage(
              `💡 The answer was *${output.revealed}*.${explanation} Let's keep going.`,
            ),
          ];
        return [
          textMessage(
            output.correct
              ? `${CORRECT_LINES[(output.explanation?.length ?? 0) % CORRECT_LINES.length]}${explanation}`
              : `❌ Not quite.${explanation} Give it one more go.`,
          ),
        ];
      }
      case "paused":
        return [
          buttonMessage(
            `⏸️ Paused. Tap Resume whenever you're ready to continue ${context.courseTitle}.`,
            [RESUME],
          ),
        ];
      case "day_complete":
        return [
          textMessage(
            `🎉 *Day ${output.day} done!*\nNext up: _${output.nextTitle}_ — unlocks ${formatUnlockTime(output.unlockAt, context.timezone)}. We'll message you then.`,
          ),
        ];
      case "locked":
        return [
          textMessage(
            `Day ${output.day} unlocks ${formatUnlockTime(output.unlockAt, context.timezone)}. We'll message you then.`,
          ),
        ];
      case "completed": {
        const text = [context.completionText, context.scoreLine]
          .filter(Boolean)
          .join("\n\n");
        const closing = buttonMessage(
          "What would you like to do next?",
          context.certificate
            ? [
                { id: HELP_IDS.certificate, title: "My certificate" },
                { id: HELP_IDS.courses, title: "My courses" },
                { id: HELP_IDS.human, title: "Talk to a person" },
              ]
            : [
                { id: HELP_IDS.courses, title: "My courses" },
                { id: HELP_IDS.human, title: "Talk to a person" },
              ],
        );
        return [
          textMessage(text),
          ...(context.certificate
            ? [
                documentMessage(
                  context.certificate.pdfUrl,
                  context.certificate.filename,
                  `🎓 Your certificate. Anyone can verify it at ${context.certificate.verifyUrl}`,
                ),
              ]
            : []),
          closing,
        ];
      }
      case "hint":
        return output.step === "lesson"
          ? [
              buttonMessage(
                "Tap Next when you're ready, or Pause to take a break.",
                [NEXT, PAUSE],
              ),
            ]
          : [];
    }
  });
}

export function pauseReminderMessage(courseTitle: string): OutgoingMessage {
  return buttonMessage(
    `👋 Ready to continue ${courseTitle}? Tap Resume to pick up where you left off.`,
    [RESUME],
  );
}

/** Inbound WhatsApp message as the webhook sees it: typed text and/or a tapped button or list row. */
export type InboundReply = {
  text?: string | null;
  replyId?: string | null;
  replyTitle?: string | null;
};

export function interpretReply(reply: InboundReply): Input {
  const id = reply.replyId?.trim() ?? "";
  if (id === BUTTON_IDS.next) return { kind: "next" };
  if (id === BUTTON_IDS.pause) return { kind: "pause" };
  if (id === BUTTON_IDS.resume) return { kind: "resume" };
  if (id.startsWith(ANSWER_PREFIX))
    return { kind: "answer", text: id.slice(ANSWER_PREFIX.length) };
  // Template quick-reply buttons carry their label (and payload); treat any of them as resume.
  if (id) return { kind: "resume" };
  const text = (reply.text ?? reply.replyTitle ?? "").trim();
  if (/^(next|continue|done)$/i.test(text)) return { kind: "next" };
  if (/^pause$/i.test(text)) return { kind: "pause" };
  if (/^(resume|start)$/i.test(text)) return { kind: "resume" };
  return { kind: "answer", text };
}
