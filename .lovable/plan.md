# WhatsApp course progression

## Build
- Add WhatsApp learner enrollments that link a phone number to a course and track the current lesson, quiz state, progress, and completion.
- Add quiz questions and answer attempts, using course resources as the ordered lesson sequence.
- Extend the signed WhatsApp callback receiver to save each incoming reply, interpret it as lesson progress or a quiz answer, and send the next lesson or correction within the open reply window.
- Issue a verifiable completion certificate after the final lesson and passed quiz, with a downloadable certificate record in the portal.

## Portal
- Replace the fixed learner welcome action with an enrollment action using the selected course and learner number.
- Show learner progress, quiz results, completion state, and certificate details from the course page.
- Keep all inbound lessons, learner answers, and outbound replies visible in Chat History with provider message IDs and status.

## Live verification
- Check the MicroLearn WABA callback log and Chat History for a fresh reply to +1 659-277-2030.
- If the callback arrives, reply through Chat History and confirm the provider message ID is stored.
- Enroll the existing learner in WhatsApp Learning Essentials and exercise the lesson, quiz, and certificate flow using signed test callbacks before a real learner run.

## External dependency
- Real incoming-message verification depends on Meta forwarding the callback to this project. If no signed callback arrives, the progression engine can be built and tested with signed callbacks, but real WhatsApp receipt cannot be claimed.

## Technical details
- Create enrollment, quiz-question, quiz-attempt, and certificate tables with grants, row-level access rules, indexes, timestamps, and UUID identifiers.
- Keep WhatsApp credentials server-side; progression processing runs only after signature verification and is idempotent by callback delivery and provider message IDs.
- Reuse the existing WhatsApp send gateway and the 24-hour customer-service window for lesson replies; retain approved templates for business-initiated starts.
