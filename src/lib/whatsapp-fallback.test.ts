import { describe, expect, it } from "vitest";
import { fakeSupabase, type Row } from "@/test/fake-supabase";
import {
  AutoReplyInProgressError,
  respondToInbound,
} from "./whatsapp-fallback.server";
import { persistWhatsAppCallback } from "./whatsapp-webhook.server";

const PHONE = "919766072308";
const COURSE = "course-1";

function setup() {
  const sent: Array<{ type: unknown; content: string; buttons: string[] }> = [];
  let failNext = 0;
  let clock = new Date("2026-10-17T10:00:00Z");
  const fake = fakeSupabase({
    unique: {
      whatsapp_progression_events: ["provider_message_id"],
      whatsapp_auto_replies: ["provider_message_id"],
    },
    rpc: {
      // Mirrors public.claim_whatsapp_auto_reply (verified separately against PostgreSQL).
      claim_whatsapp_auto_reply: (args) => {
        const contacts = fake.rows("whatsapp_contacts");
        let contact = contacts.find((row) => row.phone_number === args.p_phone);
        if (!contact) {
          contact = { phone_number: args.p_phone, needs_attention: false };
          contacts.push(contact);
        }
        const existing = fake
          .rows("whatsapp_auto_replies")
          .find(
            (row) => row.provider_message_id === args.p_provider_message_id,
          );
        if (existing) return { data: { ...existing, claimed: false } };
        const messages = args.p_messages as unknown[] | null;
        const last = contact.last_fallback_at as string | undefined;
        const cooledDown =
          !last ||
          new Date(last).getTime() <=
            clock.getTime() -
              Math.max(Number(args.p_cooldown_minutes), 0) * 60000;
        const willReply =
          Boolean(messages?.length) &&
          (args.p_kind !== "fallback" || cooledDown);
        const row: Row = {
          id: `auto-${fake.rows("whatsapp_auto_replies").length + 1}`,
          provider_message_id: args.p_provider_message_id,
          phone_number: args.p_phone,
          kind: args.p_kind,
          will_reply: willReply,
          response_messages: willReply ? messages : null,
          delivered_count: 0,
          created_at: clock.toISOString(),
          status: willReply ? "pending" : "completed",
        };
        fake.rows("whatsapp_auto_replies").push(row);
        if (args.p_kind === "fallback" && willReply)
          contact.last_fallback_at = clock.toISOString();
        if (args.p_flag_reason) {
          if (!contact.needs_attention)
            contact.attention_at = clock.toISOString();
          Object.assign(contact, {
            needs_attention: true,
            attention_reason: args.p_flag_reason,
          });
        }
        return { data: { ...row, claimed: true } };
      },
      apply_whatsapp_step: (args) => {
        const enrollment = fake
          .rows("whatsapp_course_enrollments")
          .find((row) => row.id === args.p_enrollment_id) as Row;
        Object.assign(enrollment, args.p_state, {
          state_version: (enrollment.state_version as number) + 1,
        });
        Object.assign(
          fake
            .rows("whatsapp_progression_events")
            .find((row) => row.id === args.p_event_id) as Row,
          { outcome: args.p_outcome, response_messages: args.p_messages },
        );
        return { data: null };
      },
    },
  });
  fake.rows("courses").push(
    {
      id: COURSE,
      title: "WhatsApp Learning Essentials",
      whatsapp_lesson_intro: null,
      whatsapp_completion_message: null,
      pacing_mode: "immediate",
      pacing_gap_days: 1,
      pacing_unlock_time: "09:00",
      pacing_timezone: "UTC",
      pause_reminder_hours: 24,
    },
    { id: "course-2", title: "Money Basics", pacing_timezone: "UTC" },
  );
  fake
    .rows("course_modules")
    .push({ id: "day1", course_id: COURSE, order_index: 1 });
  fake.rows("course_resources").push({
    id: "l1",
    module_id: "day1",
    title: "One",
    content: "First",
    order_index: 1,
  });
  fake
    .rows("whatsapp_contacts")
    .push({ phone_number: PHONE, needs_attention: false });
  const enroll = (row: Row) =>
    fake.rows("whatsapp_course_enrollments").push({
      id: `e${fake.rows("whatsapp_course_enrollments").length + 1}`,
      course_id: COURSE,
      phone_number: PHONE,
      learner_name: "Ann",
      status: "active",
      awaiting_reply: true,
      current_resource_id: "l1",
      current_step: "lesson",
      progress_percentage: 0,
      paused_at: null,
      pause_reminder_sent_at: null,
      next_unlock_at: null,
      nudge_sent_at: null,
      completed_at: null,
      state_version: 0,
      updated_at: "2026-10-16",
      ...row,
    });
  const completed = () => {
    enroll({
      id: "done",
      status: "completed",
      awaiting_reply: false,
      progress_percentage: 100,
      completed_at: "2026-10-16T12:00:00Z",
    });
    fake.rows("course_certificates").push({
      enrollment_id: "done",
      verification_code: "ABC123DEF456",
    });
  };
  const send = async (
    _phone: string,
    payload: Record<string, unknown>,
    content: string,
  ) => {
    if (failNext > 0) {
      failNext -= 1;
      throw new Error("gateway timeout");
    }
    const interactive = payload.interactive as
      | {
          type?: string;
          action?: { buttons?: Array<{ reply: { id: string } }> };
        }
      | undefined;
    sent.push({
      type: interactive?.type ?? payload.type,
      content,
      buttons: interactive?.action?.buttons?.map((b) => b.reply.id) ?? [],
    });
    return `wamid.out.${sent.length}`;
  };
  let counter = 0;
  const inbound = (
    input: { text?: string | null; replyId?: string; replyTitle?: string },
    id = `wamid.in.${++counter}`,
  ) => respondToInbound(fake.client, PHONE, input, id, { send, now: clock });
  const contact = () =>
    fake
      .rows("whatsapp_contacts")
      .find((row) => row.phone_number === PHONE) as Row;
  return {
    ...fake,
    send,
    inbound,
    enroll,
    completed,
    contact,
    take: () => sent.splice(0, sent.length),
    failOnce: () => (failNext = 1),
    advance: (minutes: number) =>
      (clock = new Date(clock.getTime() + minutes * 60000)),
  };
}

const MENU = ["help:courses", "help:human"];

describe("WhatsApp fallback replies", () => {
  it("offers the help menu to a learner who finished their course, and flags the chat", async () => {
    const t = setup();
    t.completed();
    expect(await t.inbound({ text: "Hi" })).toEqual({
      outcome: "no_enrollment",
      autoReply: "sent",
    });
    expect(t.take()).toEqual([
      {
        type: "button",
        content: expect.stringContaining(
          "couldn't match your message to a lesson",
        ),
        buttons: MENU,
      },
    ]);
    expect(t.contact()).toMatchObject({
      needs_attention: true,
      attention_reason: "Message didn't match an active course step",
    });
  });

  it("stays quiet within the cooldown but keeps the chat flagged", async () => {
    const t = setup();
    t.completed();
    await t.inbound({ text: "Hi" });
    t.take();
    // Staff resolve the chat; the learner writes again a few minutes later.
    Object.assign(t.contact(), {
      needs_attention: false,
      attention_reason: null,
    });
    t.advance(5);
    expect(await t.inbound({ text: "hi" })).toEqual({
      outcome: "no_enrollment",
      autoReply: "skipped",
    });
    expect(t.take()).toEqual([]);
    expect(t.contact().needs_attention).toBe(true);
    // "Start" from an old nudge is just another unmatched reply.
    expect(
      (await t.inbound({ replyId: "Start", replyTitle: "Start" })).autoReply,
    ).toBe("skipped");

    t.advance(60);
    expect((await t.inbound({ text: "hello?" })).autoReply).toBe("sent");
    expect(t.take()).toHaveLength(1);
  });

  it("lists the learner's courses when they tap My courses, regardless of cooldown", async () => {
    const t = setup();
    t.completed();
    t.enroll({
      id: "paused",
      course_id: "course-2",
      awaiting_reply: false,
      paused_at: "2026-10-16T12:00:00Z",
      progress_percentage: 40,
    });
    await t.inbound({ text: "Hi" });
    t.take();
    expect(
      await t.inbound({ replyId: "help:courses", replyTitle: "My courses" }),
    ).toEqual({ outcome: "help_courses", autoReply: "sent" });
    const [message] = t.take();
    expect(message.type).toBe("text");
    expect(message.content).toContain(
      "*WhatsApp Learning Essentials*: ✅ Completed · certificate ABC123DEF456",
    );
    expect(message.content).toContain(
      "*Money Basics*: ⏸️ Paused · 40% complete",
    );
  });

  it("offers a person when the learner has no WhatsApp course", async () => {
    const t = setup();
    expect((await t.inbound({ replyId: "help:courses" })).autoReply).toBe(
      "sent",
    );
    expect(t.take()).toEqual([
      {
        type: "button",
        content: expect.stringContaining(
          "not enrolled in a WhatsApp course yet",
        ),
        buttons: ["help:human"],
      },
    ]);
    expect(t.contact().needs_attention).toBe(false);
  });

  it("hands off to staff when the learner taps Talk to a person, even mid-course", async () => {
    const t = setup();
    t.enroll({});
    expect(
      await t.inbound({
        replyId: "help:human",
        replyTitle: "Talk to a person",
      }),
    ).toEqual({ outcome: "help_human", autoReply: "sent" });
    expect(t.take()).toEqual([
      {
        type: "text",
        content: "Thanks! Someone from the Ekatra team will reply here soon.",
        buttons: [],
      },
    ]);
    expect(t.contact()).toMatchObject({
      needs_attention: true,
      attention_reason: "Learner asked for a person",
    });
    // The tap never reached progression (which would have read it as Resume).
    expect(t.rows("whatsapp_progression_events")).toEqual([]);
  });

  it("explains an ambiguous enrollment", async () => {
    const t = setup();
    t.enroll({});
    t.enroll({ course_id: "course-2" });
    expect(await t.inbound({ text: "next" })).toEqual({
      outcome: "ambiguous_enrollment",
      autoReply: "sent",
    });
    expect(t.take()[0]).toMatchObject({
      content: expect.stringContaining("active in more than one course"),
      buttons: MENU,
    });
    expect(t.contact().attention_reason).toBe(
      "Learner is active in more than one WhatsApp course",
    );
  });

  it("uses staff settings and still flags when the fallback is switched off", async () => {
    const t = setup();
    t.rows("whatsapp_bot_settings").push({
      id: true,
      fallback_enabled: false,
      fallback_message: "unused",
      cooldown_minutes: 60,
      handoff_message: "A teacher will reply soon.",
    });
    expect((await t.inbound({ text: "Hi" })).autoReply).toBe("skipped");
    expect(t.take()).toEqual([]);
    expect(t.contact().needs_attention).toBe(true);
    await t.inbound({ replyId: "help:human" });
    expect(t.take()[0].content).toBe("A teacher will reply soon.");
  });

  it("never resends on a webhook retry", async () => {
    const t = setup();
    expect((await t.inbound({ text: "Hi" }, "wamid.same")).autoReply).toBe(
      "sent",
    );
    expect(t.take()).toHaveLength(1);
    t.advance(120);
    expect(await t.inbound({ text: "Hi" }, "wamid.same")).toEqual({
      outcome: "duplicate",
      autoReply: null,
    });
    expect(t.take()).toEqual([]);
    expect(t.rows("whatsapp_auto_replies")).toHaveLength(1);
  });

  it("resumes a partly delivered reply after the last accepted message", async () => {
    const t = setup();
    t.failOnce();
    await expect(t.inbound({ text: "Hi" }, "wamid.retry")).rejects.toThrow(
      "gateway timeout",
    );
    // A retry right away may overlap the first attempt, so it is deferred rather than sent twice.
    await expect(t.inbound({ text: "Hi" }, "wamid.retry")).rejects.toThrow(
      AutoReplyInProgressError,
    );
    expect(t.take()).toEqual([]);
    t.advance(3);
    expect(await t.inbound({ text: "Hi" }, "wamid.retry")).toEqual({
      outcome: "resent",
      autoReply: null,
    });
    expect(t.take()).toHaveLength(1);

    t.rows("whatsapp_auto_replies").push({
      id: "two",
      provider_message_id: "wamid.partial",
      phone_number: PHONE,
      kind: "courses",
      will_reply: true,
      status: "pending",
      delivered_count: 1,
      created_at: "2026-10-17T09:00:00Z",
      response_messages: [
        { payload: { type: "text" }, content: "first" },
        { payload: { type: "text" }, content: "second" },
      ],
    });
    expect((await t.inbound({ text: "Hi" }, "wamid.partial")).outcome).toBe(
      "resent",
    );
    expect(t.take().map((message) => message.content)).toEqual(["second"]);
    expect(
      t.rows("whatsapp_auto_replies").find((row) => row.id === "two"),
    ).toMatchObject({ status: "completed", delivered_count: 2 });
    expect((await t.inbound({ text: "Hi" }, "wamid.partial")).outcome).toBe(
      "duplicate",
    );
  });

  it("answers media through the webhook: the current step mid-course, the menu otherwise", async () => {
    const t = setup();
    const callback = (id: string, message: Row) =>
      persistWhatsAppCallback(
        `delivery-${id}`,
        {
          entry: [
            {
              changes: [
                { value: { messages: [{ id, from: PHONE, ...message }] } },
              ],
            },
          ],
        },
        t.client,
        async (client, inbound) => {
          await respondToInbound(client, inbound.phone, inbound, inbound.id, {
            send: t.send,
          });
        },
      );
    await callback("wamid.img1", { type: "image", image: { id: "media" } });
    expect(t.take()[0].buttons).toEqual(MENU);

    t.enroll({});
    await callback("wamid.voice", { type: "audio", audio: { id: "media" } });
    expect(t.take()[0]).toMatchObject({
      content: expect.stringContaining("Tap Next"),
      buttons: ["course:next", "course:pause"],
    });

    await callback("wamid.reaction", {
      type: "reaction",
      reaction: { message_id: "wamid.out.1", emoji: "👍" },
    });
    expect(t.take()).toEqual([]);
  });
});
