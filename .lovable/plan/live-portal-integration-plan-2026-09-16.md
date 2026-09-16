# Live Portal Integration Plan

## Goal
Make WhatsApp, Telegram, courses, and the AI tutor operate on real connected services and persistent portal data, then verify each workflow end to end.

## Work
1. **WhatsApp delivery**
   - Use the connected WhatsApp Business account and an approved template when available.
   - Send a test to `+91976072308` and verify the provider response.
   - Ensure sent and received messages can be represented in Chat History; clearly report any Meta template or 24-hour-window blocker.

2. **Telegram live Chat History**
   - Replace temporary in-memory updates with persistent Telegram contacts and messages.
   - Route bot sends through the connected Telegram service and secure the public receiver.
   - Register the live receiver with Telegram, subscribe Chat History to new messages, and verify the user's “Hello Ekatra” message appears.

3. **Real course walkthrough**
   - Make demo access work with real course data without weakening production account permissions.
   - Persist all fields shown by the editor, including modules and resources.
   - Create and publish a complete sample course, then test list, preview, module navigation, resource display, edit, and reload using demo login.

4. **AI tutor and embeddings**
   - Replace direct provider calls and missing keys with Lovable AI Gateway.
   - Use `openai/gpt-6-astra` for tutor responses and `google/gemini-embedding-2` for resource embeddings.
   - Add real vector search over course resources, persist tutor history, and expose a usable tutor chat on the course page with markdown responses.
   - Test one embedding and one grounded tutor response through the deployed portal.

5. **Production checks**
   - Resolve relevant database security warnings, validate access rules, deploy changed functions, check logs, and test desktop/mobile portal states.

## Technical details
- Connector secrets remain server-side in backend functions.
- Telegram deliveries are deduplicated by Telegram message/update identifiers.
- AI calls resend complete conversation context and surface provider errors instead of returning mock answers.
- The existing string UUID convention remains unchanged.
