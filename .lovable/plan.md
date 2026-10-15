# MicroLearn: real two-way WhatsApp courses with AI replies

## Goal
A learner messages +1 659-277-2030, the message appears in Chat History with its real message ID, and the portal answers automatically: either the next lesson or quiz feedback, or an AI tutor reply. Every message and its status comes from WhatsApp itself. Nothing is inserted by hand.

## How the work runs
The work happens in phases, each with a pass/fail check. A phase starts only after the one before it passes. If a check fails, work stops and the plan reports exactly where the message got stuck.

```text
Phase 0  Connection check      -> learner "hi" is forwarded at all?
Phase 1  Upgrade the app       -> same portal, new foundation, "hi" lands in Chat History
Phase 2  Reliable intake       -> fast receipt, a queue, no double replies
Phase 3  Course + AI replies   -> lessons, quizzes and AI answers go out automatically
Phase 4  Clean-up & insights   -> real contacts, real stats, templates, media
Phase 5  Full live test        -> two-turn conversation proven end to end
```

## Splitting the work: what I do alone vs. what runs in parallel

### Only I can do this, one step at a time (the minimum)
Everything else depends on these steps, and two agents working on them at once would collide.
1. **Phase 0 connection check.** It needs your phone and your connection setting.
2. **Phase 1 app upgrade.** It rewrites the app's foundation, which touches almost every page. Nobody else can safely edit pages while it runs.
3. **Shared groundwork, done right after the upgrade:**
   - Add the new message fields: origin, AI run, media and processing state.
   - Add the queue table.
   - Write a short **contract note** that freezes the data shape both tracks build against.

When step 3 is finished, the work splits into two tracks.

### Parallel tracks (each owns separate files, so the merge stays clean)

```text
                 +-- Track A (me): engine ----------------------+
Upgrade + shared |   receiver, queue worker, course + AI replies, |--> Merge + live test (me)
groundwork (me) -+                                                 |
                 +-- Track B (second agent): portal screens -------+
                     contacts, analytics, templates, media viewer,
                     Chat History labels, WATI wording clean-up
```

- **Track A (me): the server side.** This covers the message receiver, the queue worker, the decision between course and AI, AI replies, and the 24-hour rule (Phases 2 and 3). It needs real callbacks and secrets, so it stays with me.
- **Track B (second agent): the portal side.** This covers the contacts list, analytics numbers, template sync clean-up, removing "WATI" wording, the media viewer and Chat History labels (Phase 4). It reads only the frozen data shape. It can be built and checked against existing stored messages without live WhatsApp.
- **Rules that keep the tracks apart:**
  - Track B never edits the WhatsApp server functions or the database structure.
  - Track A never edits portal pages, except one switch to receive a new field if one is needed.
  - Any change to the data shape goes back through me.

### Merge (only I can do this)
- Bring Track B's work in, then check the build and every main page while signed in.
- Run the Phase 5 live test with your phone, from start to finish.
- Fix anything where the two tracks meet: Chat History showing queue errors and AI or course labels from Track A's data.

### What this saves
Phases 2–3 and Phase 4 take about the same effort. Running them side by side cuts that middle stretch roughly in half. The upgrade and the live test can't be shortened, because they depend on one shared codebase and on your phone.

## Phase 0: Confirm the connection is forwarding (you + me, about 5 minutes)
- You confirm that **Incoming messages = microlearn** is saved on the **MicroLearn WABA** connection itself. The old Ekatra connection's setting does not carry over.
- You send a fresh "hi" to +1 659-277-2030. I check for any forwarding attempt, even a rejected one.
- **Pass:** some forwarding attempt shows up, or the connector requires the upgrade before it will forward. Then Phase 1 starts.
- **Fail:** the setting is not saved or not available. Then I stop and tell you what to change. No code work happens.

## Phase 1: Upgrade the app foundation (in place)
- Upgrade to the modern stack (TanStack Start). Pages, sign-in (including the demo login), courses, Chat History, Meta Templates, Telegram and the Ekatra look all stay the same.
- Move the WhatsApp message receiver onto the supported route. It keeps signature checks and duplicate protection.
- Course, user and chat data are not touched. You can revert from chat history.
- **Pass:** the app builds, every main page opens while signed in, the Telegram test still works, and a fresh WhatsApp "hi" is stored with its real message ID and shows in Chat History.

## Phase 2: Reliable message intake
- The receiver only checks, saves, queues and confirms. That keeps it inside WhatsApp's 5-second limit.
- A background queue does the slow work: course progression, AI replies, sending messages and fetching media. It retries with limits and shows failures to staff.
- Each incoming message ID is processed only once, so a retry can never double-advance a learner or send two replies.
- **Pass:** sending the same callback twice gives exactly one stored message and one action.

## Phase 3: Automatic course and AI replies
- Decision order for each incoming text:
  1. Is the learner enrolled in exactly one active course that is waiting for an answer? Then the existing lesson and quiz engine grades the answer and sends the next lesson, a correction, or the certificate.
  2. Otherwise, the AI tutor answers. It uses the recent WhatsApp conversation plus the learner's course material.
- Free-form replies go out only inside the 24-hour window that the learner's message opens. Outside that window, only the approved welcome template is used.
- The AI never overrides quiz grading. A reply is saved only after WhatsApp returns a real message ID. Each message is tagged as course, AI or staff.

## Phase 4: Fill the known gaps
- **Contacts:** built from real conversations (last message, direction, totals) instead of an empty list.
- **Analytics:** real counts from stored messages: sent, accepted, delivered, read, failed, incoming, response time and course completions. They are labeled as portal-observed, with no invented Meta figures.
- **Templates:** the versioned Meta Templates records become the single source of truth. Status updates change those records in place, with no delete-and-reload. All leftover "WATI" wording is removed.
- **Media:** photos, voice notes, videos and documents are stored privately and viewable by staff. If WhatsApp doesn't let us fetch a file, Chat History shows its type and ID with a clear "not available" label.
- **Chat History:** shows direction, message ID, status timestamps, source (course, AI or staff), and queue errors with a safe retry button. The "save outbound record by hand" shortcut is removed.

## Phase 5: Full live test (needs your phone)
1. Send the approved welcome to +919766072308 and record its real message ID.
2. You reply. Your message appears in Chat History with its message ID, and an automatic course or AI reply follows with its own message ID.
3. You reply a second time. The answer shows it remembers the conversation.
4. "Delivered" and "read" are marked only if WhatsApp sends those updates.
5. Edge cases: duplicate callback, two active courses on one number, reply after 24 hours, AI out of credits, failed send, unsupported media.

## Done means
Chat History shows a real incoming message ID and a real automatic reply message ID, two turns in a row, with no manual inserts. Your phone physically receiving a message is reported separately from WhatsApp's own delivered/read updates.

## What I need from you
- Phase 0: confirm the Incoming messages setting and send one "hi".
- Phase 5: about 10 minutes of replying from your phone.
- Enough credits. The upgrade (Phase 1) is the largest step.

## Technical details
- Phase 1 follows the migrate-to-tanstack skill: preflight build gate, scan, template swap, routes generated from `App.tsx`, port custom theme tokens from `index.css`, port `index.html` metadata to `__root.tsx` `head()`, Supabase client SSR guard. The WhatsApp receiver moves to the connector-supported server route and keeps `verifyWebhookRequest` (LOVABLE_API_KEY), dedup on `x-lovable-delivery`, and the unique `provider_message_id`.
- New tables (each with GRANTs, RLS, service_role, indexes): `message_jobs` (type, payload, status, attempts, run_after, last_error, unique dedupe key; atomic claim via `FOR UPDATE SKIP LOCKED`), plus new nullable columns on `whatsapp_messages`: `origin` (course/ai/staff/template), `ai_run_id`, `media_type`, `media_id`, `media_path`, `processing_state`. A private storage bucket holds media.
- The queue worker runs as a server function triggered right after enqueue, with scheduled sweeps for retries. Backoff is bounded (e.g. 5 attempts).
- AI: Lovable AI Gateway Responses API via AI SDK, `openai/gpt-6-astra`, server-only, `store: false`, request-scoped run IDs, 402/429 surfaced as job failures.
- Keep the existing rules: provider calls go only through shared helpers; a phone advances a course only with at most one active enrollment awaiting a reply; string UUIDs. Record the queue boundary and the stack change in AGENTS.md.
- Parallel mechanics: Track B runs as a separate draft (isolated backend copy) or a background agent, with file ownership as follows. Track A owns server functions, `_shared/*` and migrations. Track B owns `src/pages/*`, `src/components/*` and `src/services/*` read paths. Track B works from the contract note, `docs/whatsapp-data-contract.md`, which lists the columns, enums and server endpoints with their response shapes. The merge accepts the draft and re-runs the build, the type check and a Playwright check of the main pages.
