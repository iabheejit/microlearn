import type { SupabaseClient } from "@supabase/supabase-js";
import { formatUnlockTime } from "./course-engine";
import {
  buttonMessage,
  textMessage,
  type InboundReply,
  type OutgoingMessage,
  type Reply,
} from "./whatsapp-course-messages";
import {
  deliverEvent,
  progressFromReply,
  type ReplyOptions,
} from "./whatsapp-progression.server";
import { sendAutomatedWhatsApp } from "./whatsapp-send.server";

// Replies to inbound WhatsApp messages that course progression cannot place: a help menu, the learner's
// course list, or a hand-off to staff. Each reply is claimed per provider message ID through
// claim_whatsapp_auto_reply (cooldown + staff flag in one transaction) and delivered from the
// whatsapp_auto_replies outbox, so webhook retries resume instead of resending.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any>;

export const HELP_IDS = {
  courses: "help:courses",
  human: "help:human",
} as const;
const MY_COURSES: Reply = { id: HELP_IDS.courses, title: "My courses" };
const TALK_TO_PERSON: Reply = { id: HELP_IDS.human, title: "Talk to a person" };

export const DEFAULT_BOT_SETTINGS = {
  fallback_enabled: true,
  fallback_message:
    "Hi! I couldn't match your message to a lesson. What would you like to do?",
  cooldown_minutes: 60,
  handoff_message: "Thanks! Someone from the Ekatra team will reply here soon.",
};
export type BotSettings = typeof DEFAULT_BOT_SETTINGS;

const AMBIGUOUS_MESSAGE =
  "Hi! You're active in more than one course, so I couldn't match your message to a lesson. What would you like to do?";

// Progression outcomes that leave the learner without a reply, and why staff should look at the chat.
const FALLBACK_REASONS: Record<string, string> = {
  no_enrollment: "Message didn't match an active course step",
  ambiguous_enrollment: "Learner is active in more than one WhatsApp course",
  no_lessons: "Enrolled course has no lessons",
};
const HUMAN_REASON = "Learner asked for a person";
// Longer than one attempt can spend sending (two messages, 30-second gateway timeout each).
export const RESUME_AFTER_MS = 2 * 60 * 1000;

/** A retry arrived while the first attempt may still be delivering; the callback should be retried later. */
export class AutoReplyInProgressError extends Error {}

export async function loadBotSettings(client: Client): Promise<BotSettings> {
  const { data, error } = await client
    .from("whatsapp_bot_settings")
    .select(
      "fallback_enabled,fallback_message,cooldown_minutes,handoff_message",
    )
    .maybeSingle();
  if (error) throw error;
  return { ...DEFAULT_BOT_SETTINGS, ...(data ?? {}) };
}

type Enrollment = {
  id: string;
  course_id: string;
  status: string;
  progress_percentage: number | null;
  paused_at: string | null;
  next_unlock_at: string | null;
};

/** The learner's WhatsApp courses with their status, or an offer to talk to a person when there are none. */
export async function coursesMessages(
  client: Client,
  phone: string,
  now: Date,
): Promise<OutgoingMessage[]> {
  const { data: enrollments, error } = await client
    .from("whatsapp_course_enrollments")
    .select("id,course_id,status,progress_percentage,paused_at,next_unlock_at")
    .eq("phone_number", phone)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const rows = (enrollments ?? []) as Enrollment[];
  if (!rows.length)
    return [
      buttonMessage("You're not enrolled in a WhatsApp course yet.", [
        TALK_TO_PERSON,
      ]),
    ];

  const { data: courses, error: courseError } = await client
    .from("courses")
    .select("id,title,pacing_timezone")
    .in("id", [...new Set(rows.map((row) => row.course_id))]);
  if (courseError) throw courseError;
  const { data: certificates, error: certificateError } = await client
    .from("course_certificates")
    .select("enrollment_id,verification_code")
    .in(
      "enrollment_id",
      rows.map((row) => row.id),
    );
  if (certificateError) throw certificateError;
  const courseById = new Map(
    (courses ?? []).map((course) => [course.id as string, course]),
  );
  const codeByEnrollment = new Map(
    (certificates ?? []).map((certificate) => [
      certificate.enrollment_id as string,
      certificate.verification_code as string,
    ]),
  );

  const lines = rows.map((row) => {
    const course = courseById.get(row.course_id);
    const title = (course?.title as string | undefined) ?? "Untitled course";
    const progress = `${row.progress_percentage ?? 0}% complete`;
    let status: string;
    if (row.status === "completed") {
      const code = codeByEnrollment.get(row.id);
      status = `✅ Completed${code ? ` · certificate ${code}` : ""}`;
    } else if (row.status !== "active") status = row.status;
    else if (row.paused_at) status = `⏸️ Paused · ${progress}`;
    else if (row.next_unlock_at && new Date(row.next_unlock_at) > now)
      status = `🔒 ${progress} · next day unlocks ${formatUnlockTime(row.next_unlock_at, (course?.pacing_timezone as string | undefined) ?? "UTC")}`;
    else status = progress;
    return `• *${title}*: ${status}`;
  });
  return [textMessage(`📚 Your courses\n\n${lines.join("\n")}`)];
}

type ClaimRow = {
  id: string;
  claimed: boolean;
  will_reply: boolean;
  status: "pending" | "completed";
  response_messages: OutgoingMessage[] | null;
  delivered_count: number;
};

async function claimAndDeliver(
  client: Client,
  args: {
    key: string;
    phone: string;
    kind: "fallback" | "courses" | "human";
    messages: OutgoingMessage[] | null;
    cooldownMinutes: number;
    flagReason: string | null;
    send: NonNullable<ReplyOptions["send"]>;
  },
) {
  const { data, error } = await client.rpc("claim_whatsapp_auto_reply", {
    p_provider_message_id: args.key,
    p_phone: args.phone,
    p_kind: args.kind,
    p_messages: args.messages,
    p_cooldown_minutes: args.cooldownMinutes,
    p_flag_reason: args.flagReason,
  });
  if (error) throw error;
  const row = data as ClaimRow;
  // Another worker holds this message; a later retry resumes its delivery if it stalls.
  if (!row.claimed) return "duplicate" as const;
  if (!row.will_reply) return "skipped" as const;
  await deliverEvent(
    client,
    row,
    args.phone,
    args.send,
    "whatsapp_auto_replies",
  );
  return "sent" as const;
}

export type InboundResult = {
  /** Progression outcome, or help_courses / help_human for menu taps, or duplicate / resent on retries. */
  outcome: string;
  /** What happened to the automated reply outside progression, when there was one. */
  autoReply: "sent" | "skipped" | "duplicate" | null;
};

/**
 * Handles one inbound WhatsApp message: help-menu taps first (progression would treat an unknown
 * button as Resume), then course progression, then the fallback menu when progression cannot reply.
 */
export async function respondToInbound(
  client: Client,
  phone: string,
  reply: InboundReply,
  providerMessageId: string,
  options: ReplyOptions = {},
): Promise<InboundResult> {
  const send = options.send ?? sendAutomatedWhatsApp;
  const now = options.now ?? new Date();

  // A retried message whose automated reply was already decided is finished, never decided again.
  const { data: existing, error: existingError } = await client
    .from("whatsapp_auto_replies")
    .select("id,status,response_messages,delivered_count,created_at")
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.status === "completed")
    return { outcome: "duplicate", autoReply: null };
  if (existing) {
    // The first attempt may still be sending; resuming now could send the same message twice.
    // Fail so the provider retries after that attempt has finished or been abandoned.
    if (
      now.getTime() - new Date(existing.created_at).getTime() <
      RESUME_AFTER_MS
    )
      throw new AutoReplyInProgressError(
        `Automated reply for ${providerMessageId} is still being delivered`,
      );
    await deliverEvent(client, existing, phone, send, "whatsapp_auto_replies");
    return { outcome: "resent", autoReply: null };
  }

  const replyId = reply.replyId?.trim();
  if (replyId === HELP_IDS.courses) {
    const autoReply = await claimAndDeliver(client, {
      key: providerMessageId,
      phone,
      kind: "courses",
      messages: await coursesMessages(client, phone, now),
      cooldownMinutes: 0,
      flagReason: null,
      send,
    });
    return { outcome: "help_courses", autoReply };
  }
  if (replyId === HELP_IDS.human) {
    const settings = await loadBotSettings(client);
    const autoReply = await claimAndDeliver(client, {
      key: providerMessageId,
      phone,
      kind: "human",
      messages: [textMessage(settings.handoff_message)],
      cooldownMinutes: 0,
      flagReason: HUMAN_REASON,
      send,
    });
    return { outcome: "help_human", autoReply };
  }

  const outcome = await progressFromReply(
    client,
    phone,
    reply,
    providerMessageId,
    {
      send,
      now,
    },
  );
  const reason = FALLBACK_REASONS[outcome];
  if (!reason) return { outcome, autoReply: null };
  const settings = await loadBotSettings(client);
  const menuText =
    outcome === "ambiguous_enrollment"
      ? AMBIGUOUS_MESSAGE
      : settings.fallback_message;
  const autoReply = await claimAndDeliver(client, {
    key: providerMessageId,
    phone,
    kind: "fallback",
    // With the fallback switched off the chat is still flagged, but nothing is sent.
    messages: settings.fallback_enabled
      ? [buttonMessage(menuText, [MY_COURSES, TALK_TO_PERSON])]
      : null,
    cooldownMinutes: settings.cooldown_minutes,
    flagReason: reason,
    send,
  });
  return { outcome, autoReply };
}
