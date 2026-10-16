import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2, RefreshCw, Send } from "lucide-react";
import { listPortalReplyTemplates, sendPortalReply } from "@/lib/whatsapp-send.functions";
import { renderReplyTemplate } from "@/lib/whatsapp-template";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function WhatsAppTemplateReply({ phoneNumber, onSent }: { phoneNumber: string; onSent: () => unknown }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [values, setValues] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [failure, setFailure] = useState("");
  const listTemplates = useServerFn(listPortalReplyTemplates);
  const send = useServerFn(sendPortalReply);
  const { data: templates = [], isFetching, error, refetch } = useQuery({ queryKey: ["portal-approved-reply-templates"], queryFn: () => listTemplates(), enabled: open, staleTime: 0, retry: false });
  const template = templates.find((t) => `${t.name}:${t.language}` === selected);
  const submit = async () => {
    if (!template || sending) return;
    setSending(true); setFailure(""); setFeedback("");
    try {
      const result = await send({ data: { phoneNumber, templateName: template.name, language: template.language, parameters: values } });
      if (!result.ok) { setFailure(result.error); return; }
      setFeedback(`Accepted by WhatsApp · ID: ${result.messageId}${result.historySaved ? "" : " · History could not be saved; do not resend."}`);
      await onSent();
    } catch (e) { setFailure(e instanceof Error ? e.message : "The template could not be sent."); }
    finally { setSending(false); }
  };
  return <div className="space-y-3">
    <Button variant="outline" onClick={() => setOpen(!open)} aria-expanded={open}><FileText className="mr-2 h-4 w-4" />Approved template</Button>
    {open && <div className="space-y-3 border-t border-border pt-3">
      <div className="flex items-center gap-2">
        <Select value={selected} onValueChange={(id) => { setSelected(id); const t = templates.find((t) => `${t.name}:${t.language}` === id); setValues(t?.variables.map(() => "") ?? []); setFeedback(""); setFailure(""); }} disabled={sending || isFetching}>
          <SelectTrigger aria-label="Approved WhatsApp template" className="min-w-0 flex-1"><SelectValue placeholder={isFetching ? "Loading approved templates…" : "Select approved template"} /></SelectTrigger>
          <SelectContent>{templates.map((t) => <SelectItem key={`${t.name}:${t.language}`} value={`${t.name}:${t.language}`}>{t.name} · {t.language}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="ghost" size="icon" title="Refresh approved templates" aria-label="Refresh approved templates" disabled={sending || isFetching} onClick={() => void refetch()}><RefreshCw className="h-4 w-4" /></Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
      {!isFetching && !error && templates.length === 0 && <p className="text-sm text-muted-foreground">No approved text templates available.</p>}
      {template && <>
        {template.variables.map((v, i) => <div key={v} className="space-y-1"><Label htmlFor={`template-${phoneNumber}-${v}`}>Value {v}</Label><Input id={`template-${phoneNumber}-${v}`} aria-label={`Template value ${v}`} value={values[i] ?? ""} maxLength={1024} disabled={sending} onChange={(e) => setValues((current) => current.map((value, j) => j === i ? e.target.value : value))} /></div>)}
        <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{renderReplyTemplate(template, values)}</p>
        <Button onClick={() => void submit()} disabled={sending || isFetching || values.some((v) => !v.trim())}><>{sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Send approved template</></Button>
      </>}
      {feedback && <p role="status" className="break-all text-xs text-muted-foreground">{feedback}</p>}
      {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
    </div>}
  </div>;
}