# WhatsApp template automation and delivery tracking

## Goal
Give staff one place to monitor `course_welcome`, revise rejected versions, automatically send the first approved version to **+91 97660 72308**, and follow the resulting message through delivery.

## Build

### 1. Versioned template records
- Add a template-version history that keeps each submitted body, language, category, sample values, provider template ID/name, review status, rejection reason, author, and timestamps.
- Import the current pending `course_welcome` submission as version 1.
- Preserve every prior version; never overwrite or delete audit history.
- Treat an update as a new provider template name such as `course_welcome_v2`, because Meta templates cannot be edited in place.

### 2. Approval tracker and resubmission workflow
- Expand the existing WhatsApp admin status page with a **Template approval** section showing the active version, Meta status, last checked time, rejection reason, and version history.
- Add staff-only actions to edit a rejected draft and submit the next version to Meta.
- Validate numbered placeholders and require one sample value for each placeholder before submission.
- Record each submission and provider response in the audit trail.

### 3. Automatic approval check and one-time send
- Add a protected scheduled function that checks Meta every five minutes for the active `course_welcome` version.
- When Meta changes it to `APPROVED`, atomically claim a one-time send job so repeated scheduler runs cannot send duplicates.
- Send to **+91 97660 72308** using `Abheejit` and `WhatsApp Learning Essentials` as the two template values.
- Persist the provider response, WhatsApp message ID, send time, and failure details.
- If Meta returns `REJECTED`, stop automatic sending and expose the reason and resubmit action in the admin.

### 4. Delivery verification
- Continue consuming signed WhatsApp status callbacks and map `sent`, `delivered`, `read`, or `failed` events to the saved outgoing message by WhatsApp message ID.
- Store status timestamps and sanitized provider errors.
- Show the WhatsApp message ID and latest delivery status in both the diagnostics page and Chat History.
- Flag a sent message as awaiting callback rather than claiming delivery when no status callback exists.

### 5. Live-message verification
- Confirm the new Telegram message is visible in Chat History; it is already persisted as incoming.
- Investigate why the newly sent WhatsApp message has not produced a signed callback despite `microlearn` being selected.
- After the live callback arrives, verify the incoming WhatsApp message and the automatic template send are both present in Chat History.

## Access and safety
- Limit template editing, submission, scheduling, and diagnostics to active administrators and content creators.
- Keep WhatsApp credentials server-side and verify all incoming callback signatures.
- Make scheduling and sending idempotent, with an audit entry for every check, submission, send attempt, callback, and error.

## Technical details
- Add tables for template versions and send jobs; extend outgoing-message delivery fields where needed, with grants, row-level access rules, indexes, and update timestamps.
- Add staff endpoints for version creation/submission and a scheduler-only approval checker/sender.
- Enable `pg_cron` and `pg_net`, then register the five-minute callback using the project function URL and publishable key.
- Deploy the changed functions, verify the scheduler registration, test rejection/approval state handling without duplicate sends, and check desktop/mobile admin views.
