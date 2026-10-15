export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWhatsAppReplyWindowOpen(
  messages: ReadonlyArray<{ sent: boolean; timestamp: string; providerMessageId?: string | null }>,
  now = Date.now(),
) {
  return messages.some((message) => {
    const timestamp = Date.parse(message.timestamp);
    return !message.sent && Boolean(message.providerMessageId) && Number.isFinite(timestamp)
      && timestamp <= now && now - timestamp < REPLY_WINDOW_MS;
  });
}

export class WhatsAppReplyWindowClosedError extends Error {
  constructor() {
    super("The 24-hour reply window is closed. Send an approved template instead.");
    this.name = "WhatsAppReplyWindowClosedError";
  }
}