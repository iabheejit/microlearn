# Complete WhatsApp messaging and AI conversation flow

## Goal
Make WhatsApp conversations reliable end to end: receive genuine callbacks, store every provider message ID and status, answer learners with Lovable AI, advance active courses safely, and remove misleading legacy or placeholder behavior.

## 0. Verify the MicroLearn WABA incoming destination independently
- Set the MicroLearn WABA connection’s **Incoming messages** destination to this `microlearn` project and verify that the setting remains saved on that specific connection.
- Before migration or feature work, send a fresh learner message to `+1 659-277-2030` and check independently for a receiver request, callback delivery ID, genuine provider message ID, persisted inbound message, and Chat History row.
- Treat this as a hard prerequisite: if no callback arrives, stop the end-to-end test and diagnose the connection destination or forwarding path without attributing the failure to course, AI, analytics, or media code.
- Record the exact observed boundary—connection forwarding, receiver verification, persistence, or Chat History—without manufacturing an inbound event or inferring delivery from an outbound send.

## 1. Migrate inbound handling to the supported stack
- Migrate the existing app in place to TanStack Start while preserving portal routes, authentication, course data, Chat History, and the current visual system.
- Replace the unsupported Classic inbound receiver with the supported public WhatsApp callback route.
- Keep signature verification, callback delivery-ID deduplication, message-ID deduplication, sanitized diagnostics, and server-only connector credentials.
- Re-run the standalone incoming-destination test after migration to confirm the supported receiver still gets genuine callbacks.

## 2. Make callback processing fast and durable
- Limit the public callback request to verification, normalization, durable persistence, and queue insertion, then return success promptly.
- Add a database-backed job queue for course progression, AI replies, media retrieval, and retryable provider sends.
- Claim jobs atomically, enforce bounded retry/backoff for transient failures, and retain terminal failure details for staff diagnostics.
- Keep one processing event per provider message ID so callback retries cannot advance a learner or send an AI answer twice.

## 3. Add AI replies without breaking course progression
- Use Lovable AI with `openai/gpt-6-astra` from server-only code and preserve the existing stored WhatsApp conversation per phone number.
- Build the prompt from the recent persisted conversation plus the learner’s active course and relevant course resources.
- Route unambiguous active-course answers through the deterministic lesson/quiz progression engine first; use AI for tutoring, clarification, and ordinary conversation rather than overriding quiz grading.
- Persist the inbound learner message before AI work, then persist the AI reply only after WhatsApp returns a genuine provider message ID.
- Enforce the verified 24-hour reply window for all free-form AI and staff replies; use an approved template only for a valid business-initiated flow.
- Record AI run correlation and safe failure details without storing secrets or model reasoning.

## 4. Replace placeholder contacts and analytics
- Treat WhatsApp contacts as a portal conversation index derived from genuine inbound/outbound interactions; do not claim Meta exposes a contact directory when it does not.
- Remove `getContacts`’ empty placeholder and return persisted, deduplicated contacts with last interaction, direction, status, and message totals.
- Replace empty analytics objects with live operational metrics computed from stored messages and callbacks: sent, accepted, delivered, read, failed, inbound, response time, reply-window state, and course progression outcomes.
- Clearly label these as portal-observed WhatsApp metrics; do not fabricate Meta billing or account-level analytics unavailable through the connector.

## 5. Consolidate template synchronization
- Remove all remaining WATI wording from portal logs and errors.
- Make the versioned template records and their audit events authoritative.
- Sync provider status into existing versions without deleting and reinserting the local cache.
- Keep submission, approval, rejection, resubmission, and send history linked to provider template IDs.

## 6. Support incoming media safely
- Parse inbound image, audio, video, and document metadata instead of storing generic placeholder text.
- Fetch media server-side through the connected WhatsApp gateway only when that operation is supported, validate size/type, and store files privately.
- Save message/media metadata and expose authenticated signed access in Chat History.
- If the gateway does not expose retrieval for a received media ID, retain the genuine media ID/type and show an explicit unavailable state rather than inventing content.

## 7. Strengthen Chat History and diagnostics
- Keep conversations grouped by persisted contact and show inbound/outbound direction, provider message ID, callback status, delivery/read/failure timestamps, media, AI/manual origin, and processing state.
- Add visible queue and AI failure states for staff, with a safe manual retry only for retryable jobs.
- Continue realtime updates with bounded polling as fallback; polling observes stored callbacks and does not manufacture delivery state.
- Remove any path that manually inserts a fake provider event. Manual sends appear only after the gateway returns a real message ID.

## 8. Live verification
- Verify the AI Gateway with a real server-side request and a follow-up using stored conversation context.
- Send an approved welcome template and record its real provider message ID.
- From a learner phone, send a fresh reply to `+1 659-277-2030`; confirm the genuine inbound message ID, callback delivery ID, contact update, and Chat History row.
- Confirm the queued course/AI decision runs once, WhatsApp accepts the reply, and the outbound provider message ID appears in Chat History.
- Complete a second learner turn to prove back-and-forth context, then verify delivered/read only if matching Meta status callbacks arrive.
- Test duplicate callbacks, ambiguous concurrent enrollments, closed 24-hour windows, AI credit/rate errors, failed sends, and unsupported media.

## Technical details
- Add migrations for queue jobs, message origin/AI correlation, contact aggregates or query support, and media metadata; include grants, row-level policies, indexes, and service-role access for every new public table.
- Keep all WhatsApp provider operations in shared server-side helpers, and keep the existing rule that a phone advances a course only when at most one active enrollment awaits a reply.
- Use the Responses API through the AI SDK, streamed and consumed server-side, with request-scoped gateway run IDs, `store: false`, required reasoning options, and the documented 400/401/402/403/429/5xx behavior.
- Preserve string UUIDs throughout and record the TanStack migration and queue boundary as architecture rules.

## Completion standard
The work is complete only after the portal stores a real inbound callback and message ID, sends a real AI/course reply with a second provider message ID, and displays both in Chat History. Physical receipt may be reported separately; delivery/read are confirmed only by matching Meta callbacks.
