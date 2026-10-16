import { useEffect, useRef, useState } from "react";
import WhatsAppTemplateReply from "./WhatsAppTemplateReply";
import { Loader2, RefreshCw, Send } from "lucide-react";
import { useWhatsAppChat } from "@/hooks/useChatHistory";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { isWhatsAppReplyWindowOpen, WhatsAppReplyWindowClosedError } from "@/lib/whatsapp-reply-window";

export default function WhatsAppLearnerChat({ phoneNumber, learnerName }: { phoneNumber: string; learnerName: string }) {
  const { messages, isLoading, error, sendMessage, refetch } = useWhatsAppChat(phoneNumber);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [windowRejected, setWindowRejected] = useState(false);
  const [now, setNow] = useState(Date.now());
  const transcript = useRef<HTMLDivElement>(null);
  const windowOpen = isWhatsAppReplyWindowOpen(messages, now) && !windowRejected;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const container = transcript.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages]);
  useEffect(() => {
    setDraft("");
    setSendError("");
    setWindowRejected(false);
  }, [phoneNumber]);

  const send = async () => {
    const content = draft.trim();
    if (!content || sending || isLoading || !windowOpen) return;
    setSending(true);
    setSendError("");
    try {
      await sendMessage(content);
      setDraft("");
    } catch (failure) {
      if (failure instanceof WhatsAppReplyWindowClosedError) setWindowRejected(true);
      else setSendError(failure instanceof Error ? failure.message : "Your message could not be sent. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section aria-label="WhatsApp learner chat" className="min-w-0 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium break-words">{learnerName}</h3>
          <p className="text-sm text-muted-foreground break-all">{phoneNumber}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Refresh learner chat" title="Refresh learner chat" onClick={() => void refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <div ref={transcript} role="log" aria-label="Learner messages" aria-live="polite" className="h-96 overflow-y-auto rounded-md border border-border p-3 space-y-3">
        {isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />}
        {error && <p role="alert" className="text-sm text-destructive">The conversation could not be loaded. Please refresh.</p>}
        {!isLoading && !error && messages.length === 0 && <p className="text-sm text-muted-foreground">No WhatsApp messages yet.</p>}
        {messages.map((message) => (
          <div key={message.id} className={`max-w-[90%] rounded-md p-3 ${message.sent ? "ml-auto bg-primary/10" : "mr-auto bg-muted"}`}>
            <p className="mb-1 text-xs font-medium text-muted-foreground">{message.sent ? "MicroLearn" : learnerName}</p>
            <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <time className="text-xs text-muted-foreground" dateTime={message.timestamp}>{new Date(message.timestamp).toLocaleString()}</time>
              {message.status && <Badge variant="outline">{message.status}</Badge>}
            </div>
            {message.providerMessageId && <p className="mt-2 break-all font-mono text-xs text-muted-foreground">ID: {message.providerMessageId}</p>}
            {message.statusError && <p className="mt-1 text-xs text-destructive">{message.statusError}</p>}
          </div>
        ))}
      </div>
      {!isLoading && !windowOpen && <div role="status" className="space-y-2">
        <p className="text-sm text-muted-foreground">The 24-hour reply window is closed. Send an approved template, or wait for a new learner message.</p>
      </div>}
      <WhatsAppTemplateReply key={phoneNumber} phoneNumber={phoneNumber} onSent={refetch} />
      {sendError && <p role="alert" className="text-sm text-destructive">{sendError}</p>}
      <div className="flex items-end gap-2">
        <Textarea aria-label="Reply to learner" placeholder="Reply to learner…" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={isLoading || !windowOpen || sending} maxLength={4096} className="min-w-0 resize-none" onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); }
        }} />
        <Button size="icon" aria-label="Send learner reply" title="Send learner reply" disabled={isLoading || !windowOpen || sending || !draft.trim()} onClick={() => void send()}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </section>
  );
}