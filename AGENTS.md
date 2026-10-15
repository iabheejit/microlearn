# Architecture Rules

- Keep WhatsApp provider calls in shared server-side helpers so webhook automation and staff actions use the same secured gateway path.
- Treat a learner phone number as unambiguous only when it has at most one active WhatsApp course enrollment awaiting a reply.
- The app runs on TanStack Start; WhatsApp callbacks arrive at the public route `/api/public/whatsapp/webhook`, which only verifies the Lovable signature and persists the inbox, messages and statuses — course progression and AI replies are added on top, not inside the signature check.
- Supabase edge functions remain deployed as the rollback path until they are explicitly moved into server functions.
