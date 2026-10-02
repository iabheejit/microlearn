# Architecture Rules

- Keep WhatsApp provider calls in shared server-side helpers so webhook automation and staff actions use the same secured gateway path.
- Treat a learner phone number as unambiguous only when it has at most one active WhatsApp course enrollment awaiting a reply.