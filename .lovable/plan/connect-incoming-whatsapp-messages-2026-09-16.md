# Connect incoming WhatsApp messages

## Build
- Add a secure public receiver in the portal for forwarded WhatsApp callbacks from `api.ekatra.io`.
- Validate a shared forwarding secret, normalize inbound message and delivery-status payloads, prevent duplicate callbacks, and save messages/contacts to Chat History.
- Record each callback's delivery ID, provider message ID, processing result, timestamp, and sanitized error details.

## Admin diagnostics
- Add a WhatsApp webhook status page available only to administrators and content creators.
- Show receiver readiness, the portal endpoint to forward to, last successful callback time, recent callback IDs, processing status, and errors.
- Add refresh and clear status indicators without exposing secrets or raw sensitive headers.

## Live verification
- Deploy and probe the receiver with a signed test callback.
- Confirm the test inbound row appears in Chat History and that the diagnostics page records it.
- After `api.ekatra.io` forwards callbacks to the new endpoint, send a fresh real message to the connected Ekatra number and verify both the inbound message and portal reply are stored.

## External requirement
- The existing `api.ekatra.io` receiver must forward each callback body and delivery ID to the new portal endpoint using the same shared secret. The portal cannot change that external receiver's code or configuration by itself.

## Technical details
- Add a callback-log table with grants, row-level access rules, uniqueness constraints, and indexes.
- Add a dedicated Edge Function receiver, database-backed status reads, an admin route, and sidebar navigation.
- Keep WhatsApp credentials server-side and store no authorization headers or secret values in callback logs.
