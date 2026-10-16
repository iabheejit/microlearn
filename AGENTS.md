# Architecture Rules

- Restrict provider chat records and quiz answer keys to active staff; profiles and roles are readable only by their owner or an active admin, with provider IDs writable only by trusted server code to prevent fabricated reply windows.
- Keep WhatsApp provider calls in shared server-side helpers so webhook automation and staff actions use the same secured gateway path.
- Treat a learner phone number as unambiguous only when it has at most one active WhatsApp course enrollment awaiting a reply.
- The app runs on TanStack Start; WhatsApp callbacks arrive at the public route `/api/public/whatsapp/webhook`, which only verifies the Lovable signature and persists the inbox, messages and statuses — course progression and AI replies are added on top, not inside the signature check.
- Supabase edge functions remain deployed as the rollback path until they are explicitly moved into server functions.
- Chat History and course-page sends use authenticated TanStack server functions and the shared WhatsApp send helper; approved templates are rechecked against the linked WABA before sending to prevent stale approval or language mismatches.
- Chat History checks the incoming-message reply window before enabling WhatsApp free-form sends and treats server window rejections as an actionable template state, not an application crash; the server remains authoritative.
- Verify WhatsApp callbacks using the linked WhatsApp connection key, never the platform gateway key; require delivery/event headers so retries preserve identity.
- Course-page learner chat reuses useWhatsAppChat and the enrollment's phone so it shares persisted provider IDs, delivery updates and secured sending with Chat History; do not create a second message store or merge WhatsApp messages into AI tutor history.
