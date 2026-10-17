// Pure helpers shared by the WhatsApp functions. No I/O so they can be unit tested.

// E.164 allows at most 15 digits; anything under 8 cannot include a country code.
export function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

// Meta can deliver status callbacks out of order; never move a message backwards.
const STATUS_RANK: Record<string, number> = { accepted: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

// Statuses a message may move from when `next` arrives, or null when `next` is not tracked.
export function statusesBelow(next: string) {
  const nextRank = STATUS_RANK[next];
  if (nextRank === undefined) return null;
  return Object.keys(STATUS_RANK).filter((status) => STATUS_RANK[status] < nextRank);
}

export function gradeQuizAnswer(reply: string, options: unknown[], correctAnswer: string) {
  const answer = reply.trim().toLowerCase();
  const chosen = /^\d+$/.test(answer) ? options[Number(answer) - 1] : undefined;
  const normalized = typeof chosen === 'string' ? chosen.trim().toLowerCase() : answer;
  return normalized === correctAnswer.trim().toLowerCase();
}

export const isContinueReply = (reply: string) => /^(next|done|continue)$/i.test(reply.trim());

// The course_welcome template is always sent with {{1}} = learner name and {{2}} = course title.
export const WELCOME_TEMPLATE_PLACEHOLDERS = 2;

export function templatePlaceholderCount(body: string) {
  const placeholders = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  const expected = placeholders.length ? Math.max(...placeholders) : 0;
  return new Set(placeholders).size === expected ? expected : null;
}

const REVIEW_STATUSES = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'ERROR', 'IN_APPEAL', 'DISABLED', 'PENDING_DELETION', 'DELETED', 'LIMIT_EXCEEDED', 'ARCHIVED'];

/**
 * The review status to store for a status Meta reports, or null to keep the stored one. FLAGGED is a quality
 * warning on a template that can still be sent, so it must not knock it out of the 'latest APPROVED' lookup;
 * REINSTATED means approved again; anything unrecognised is recorded but never overwrites a status.
 */
export function nextReviewStatus(incoming: unknown): string | null {
  const status = typeof incoming === 'string' ? incoming.trim().toUpperCase() : '';
  if (status === 'REINSTATED') return 'APPROVED';
  return REVIEW_STATUSES.includes(status) ? status : null;
}
