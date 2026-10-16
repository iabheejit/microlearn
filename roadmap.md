# Roadmap

- [x] Add course-page Learner Chat for the existing enrolled learner; verify incoming messages and a real course-page reply read back in Chat History with shared provider IDs

- [x] Send a real WhatsApp test to +919766072308 and report the provider response; confirm its portal history record
- [x] Receive the first message sent by a user to @VEFTestBot and confirm it appears in Chat History
- [x] Create a real course with modules/resources and verify demo end to end
- [x] Connect AI tutor chat and embeddings to Lovable AI and verify both

- [x] Set the new MicroLearn WABA Incoming messages destination to microlearn in connector settings
- [x] Deploy signed WhatsApp callback receiver and staff webhook diagnostics page
- [x] Enable free-form portal replies only within a verified 24-hour incoming-message window
- [x] Receive a fresh WhatsApp message in Chat History and reply; real inbound and outbound IDs verified, portal reply delivered
- [x] Track course_welcome approval every five minutes and automatically send its first approved version to +919766072308
- [x] Add the approved course_welcome message action to the course flow
- [x] Confirm the approved template reaches the learner
- [x] Send a fresh approved course_welcome template to +919766072308 and save its provider message ID
- [x] Use +919766072308 automatically from the course welcome action
- [x] Add an in-portal Meta template submission, resubmission, approval feed, and audit trail
- [x] Keep the full WhatsApp reply and follow-up composer available in Chat History
- [x] Retry course_welcome to +919766072308 after Meta approves the Ekatra display name
- [x] Verify a fresh inbound “hi” and portal reply end to end through signed message and delivery callbacks
- [x] Link and verify MicroLearn WABA sender +1 659-277-2030; deploy its credentials to the portal
- [x] Submit course_welcome version 2 to the new MicroLearn WABA and activate approval monitoring
- [x] Confirm Meta approval of the active course_welcome template and delivery to +919766072308
- [x] Verify the learner's fresh “hi” to +1 659-277-2030 and the delivered portal reply in Chat History
- [x] Connect incoming learner replies to lesson progress, quiz attempts, and certificate completion (deployed; awaiting a live Meta callback)

## Upgrade (TanStack Start)
- [x] Correct the callback signing key and test verification without inserting fake incoming messages
- [x] Publish the callback signing-key correction and verify a fresh real incoming message and delivered portal reply
- [x] Upgrade portal to TanStack Start and add the bare signed WhatsApp callback route
- [x] Verify MicroLearn WABA routes incoming messages to the upgraded app through a real signed inbound callback and outbound delivery callbacks
- [ ] Move course progression, staff actions and templates onto the new route/server functions (handed to the parallel agent)
