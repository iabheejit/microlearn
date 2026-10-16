// Channel-neutral course engine. Pure: no I/O, so every rule here is unit tested.
// WhatsApp (whatsapp-progression.server.ts) and web (learner.server.ts) render its outputs.
//
// Model: an enrollment points at one lesson (`currentResourceId`, null = not started) and a step:
// "lesson" (the learner is reading it and must tap Next) or "question" (its quiz awaits an answer).
// Each course module is a day. With pacing, finishing a day sets `nextUnlockAt`; the pointer already
// names the next day's first lesson, which is delivered once that time has passed.

export type Step = "lesson" | "question";

export type Lesson = {
  id: string;
  moduleId: string;
  title: string;
  content: string;
};

export type Quiz = {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string | null;
};

export type PacingMode = "immediate" | "fixed_time" | "after_completion";

export type Pacing = {
  mode: PacingMode;
  /** Days between course days (1 = next day). */
  gapDays: number;
  /** Local unlock time "HH:MM" for fixed_time. */
  unlockTime: string;
  /** IANA timezone for fixed_time, e.g. "Asia/Kolkata". */
  timezone: string;
};

export type EnrollmentState = {
  status: "active" | "completed" | "paused";
  currentResourceId: string | null;
  step: Step;
  progress: number;
  pausedAt: string | null;
  pauseReminderSentAt: string | null;
  nextUnlockAt: string | null;
  nudgeSentAt: string | null;
  completedAt: string | null;
};

export type Input =
  | { kind: "next" }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "answer"; text: string };

export type LessonOutput = {
  kind: "lesson";
  lesson: Lesson;
  position: number;
  total: number;
  day: number;
  dayCount: number;
};

export type Output =
  | LessonOutput
  | { kind: "question"; quiz: Quiz }
  | { kind: "feedback"; correct: boolean; explanation: string | null }
  | { kind: "paused" }
  | { kind: "day_complete"; day: number; unlockAt: string }
  | { kind: "locked"; day: number; unlockAt: string }
  | { kind: "completed" }
  | { kind: "hint"; step: Step };

export type Outcome =
  | "inactive"
  | "locked"
  | "unlocked"
  | "paused"
  | "resumed"
  | "started"
  | "question"
  | "wrong_answer"
  | "advanced"
  | "day_complete"
  | "completed"
  | "hint"
  | "no_lessons";

export type Decision = {
  outcome: Outcome;
  state: EnrollmentState;
  outputs: Output[];
  attempt: { questionId: string; answer: string; correct: boolean } | null;
};

export type DecideArgs = {
  state: EnrollmentState;
  lessons: Lesson[];
  /** Quiz of the lesson the pointer names (lesson 1 when not started), or null. */
  quiz: Quiz | null;
  pacing: Pacing;
  input: Input;
  now: Date;
};

export function gradeAnswer(reply: string, quiz: Quiz) {
  const answer = reply.trim().toLowerCase();
  const chosen = /^\d+$/.test(answer)
    ? quiz.options[Number(answer) - 1]
    : undefined;
  const normalized =
    typeof chosen === "string" ? chosen.trim().toLowerCase() : answer;
  return normalized === quiz.correctAnswer.trim().toLowerCase();
}

export function dayInfo(lessons: Lesson[], index: number) {
  const days = [...new Set(lessons.map((lesson) => lesson.moduleId))];
  return {
    day: days.indexOf(lessons[index].moduleId) + 1,
    dayCount: days.length,
  };
}

const lessonOutput = (lessons: Lesson[], index: number): LessonOutput => ({
  kind: "lesson",
  lesson: lessons[index],
  position: index + 1,
  total: lessons.length,
  ...dayInfo(lessons, index),
});

export function decideStep({
  state,
  lessons,
  quiz,
  pacing,
  input,
  now,
}: DecideArgs): Decision {
  const unchanged = (outcome: Outcome, outputs: Output[]): Decision => ({
    outcome,
    state,
    outputs,
    attempt: null,
  });
  if (state.status !== "active") return unchanged("inactive", []);
  if (!lessons.length) return unchanged("no_lessons", []);

  const started = state.currentResourceId !== null;
  const found = started
    ? lessons.findIndex((lesson) => lesson.id === state.currentResourceId)
    : -1;
  // A removed lesson restarts the learner at the first lesson rather than stranding them.
  const index = found < 0 ? 0 : found;
  const currentItem = (): Output[] =>
    state.step === "question" && quiz
      ? [{ kind: "question", quiz }]
      : [lessonOutput(lessons, index)];

  // A finished day waits for its unlock time; the pointer already names the next day's first lesson.
  if (state.nextUnlockAt) {
    if (now.getTime() < new Date(state.nextUnlockAt).getTime()) {
      return unchanged("locked", [
        {
          kind: "locked",
          day: dayInfo(lessons, index).day,
          unlockAt: state.nextUnlockAt,
        },
      ]);
    }
    return {
      outcome: "unlocked",
      state: {
        ...state,
        nextUnlockAt: null,
        nudgeSentAt: null,
        pausedAt: null,
        pauseReminderSentAt: null,
        step: "lesson",
      },
      outputs: [lessonOutput(lessons, index)],
      attempt: null,
    };
  }

  if (state.pausedAt) {
    if (input.kind === "pause")
      return unchanged("paused", [{ kind: "paused" }]);
    return {
      outcome: "resumed",
      state: { ...state, pausedAt: null, pauseReminderSentAt: null },
      outputs: currentItem(),
      attempt: null,
    };
  }

  if (input.kind === "pause") {
    return {
      outcome: "paused",
      state: {
        ...state,
        pausedAt: now.toISOString(),
        pauseReminderSentAt: null,
      },
      outputs: [{ kind: "paused" }],
      attempt: null,
    };
  }

  if (!started || found < 0) {
    return {
      outcome: "started",
      state: { ...state, currentResourceId: lessons[0].id, step: "lesson" },
      outputs: [lessonOutput(lessons, 0)],
      attempt: null,
    };
  }

  const advance = (lead: Output[], attempt: Decision["attempt"]): Decision => {
    const next = lessons[index + 1];
    if (!next) {
      return {
        outcome: "completed",
        state: {
          ...state,
          status: "completed",
          progress: 100,
          completedAt: now.toISOString(),
          step: "lesson",
        },
        outputs: [...lead, { kind: "completed" }],
        attempt,
      };
    }
    const moved: EnrollmentState = {
      ...state,
      currentResourceId: next.id,
      step: "lesson",
      progress: Math.round(((index + 1) / lessons.length) * 100),
    };
    if (next.moduleId !== lessons[index].moduleId) {
      const unlockAt = computeUnlockAt(pacing, now);
      if (unlockAt && unlockAt.getTime() > now.getTime()) {
        return {
          outcome: "day_complete",
          state: {
            ...moved,
            nextUnlockAt: unlockAt.toISOString(),
            nudgeSentAt: null,
          },
          outputs: [
            ...lead,
            {
              kind: "day_complete",
              day: dayInfo(lessons, index).day,
              unlockAt: unlockAt.toISOString(),
            },
          ],
          attempt,
        };
      }
    }
    return {
      outcome: "advanced",
      state: moved,
      outputs: [...lead, lessonOutput(lessons, index + 1)],
      attempt,
    };
  };

  if (state.step === "lesson" || !quiz) {
    if (input.kind !== "next" && input.kind !== "resume")
      return unchanged("hint", [{ kind: "hint", step: "lesson" }]);
    if (quiz) {
      return {
        outcome: "question",
        state: { ...state, step: "question" },
        outputs: [{ kind: "question", quiz }],
        attempt: null,
      };
    }
    return advance([], null);
  }

  // Question step: only an answer moves on; Next or Resume just shows the question again.
  if (input.kind !== "answer" || !input.text.trim())
    return unchanged("hint", [{ kind: "question", quiz }]);
  const correct = gradeAnswer(input.text, quiz);
  const attempt = {
    questionId: quiz.id,
    answer: input.text.trim().slice(0, 4096),
    correct,
  };
  if (!correct) {
    return {
      outcome: "wrong_answer",
      state,
      outputs: [
        { kind: "feedback", correct: false, explanation: quiz.explanation },
        { kind: "question", quiz },
      ],
      attempt,
    };
  }
  return advance(
    [{ kind: "feedback", correct: true, explanation: quiz.explanation }],
    attempt,
  );
}

// ---------- pacing ----------

/** Offset of `timeZone` from UTC at `date`, in minutes. */
function zoneOffsetMinutes(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour,
    +parts.minute,
    +parts.second,
  );
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** The UTC instant of a wall-clock time in `timeZone` (DST-safe for real-world offsets). */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let result = guess - zoneOffsetMinutes(new Date(guess), timeZone) * 60000;
  // Re-check once: the offset at the result can differ from the guess across a DST change.
  result = guess - zoneOffsetMinutes(new Date(result), timeZone) * 60000;
  return new Date(result);
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** When the next course day unlocks after finishing one at `finishedAt`, or null when unpaced. */
export function computeUnlockAt(pacing: Pacing, finishedAt: Date): Date | null {
  const gap = Math.min(Math.max(Math.round(pacing.gapDays) || 1, 1), 30);
  if (pacing.mode === "immediate") return null;
  if (pacing.mode === "after_completion")
    return new Date(finishedAt.getTime() + gap * 24 * 60 * 60 * 1000);
  const timeZone = isValidTimeZone(pacing.timezone) ? pacing.timezone : "UTC";
  const [hour, minute] = /^([01]\d|2[0-3]):([0-5]\d)$/.test(pacing.unlockTime)
    ? pacing.unlockTime.split(":").map(Number)
    : [9, 0];
  const local = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(finishedAt)
      .map((part) => [part.type, part.value]),
  );
  // Calendar arithmetic on the local date, then convert that wall-clock time back to UTC.
  const target = new Date(
    Date.UTC(+local.year, +local.month - 1, +local.day + gap),
  );
  return zonedTimeToUtc(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    target.getUTCDate(),
    hour,
    minute,
    timeZone,
  );
}

export function formatUnlockTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: isValidTimeZone(timeZone) ? timeZone : "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}
