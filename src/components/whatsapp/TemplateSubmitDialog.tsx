import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { placeholdersOf, utilityIssues, type TemplateCategory } from "@/lib/whatsapp-template-category";
import { rewriteTemplateForUtility, submitWhatsAppTemplate } from "@/lib/whatsapp-templates.functions";
import { AlertCircle, RefreshCw, Send, Sparkles, Undo2 } from "lucide-react";

export type TemplateDraft = { templateKey: string; body: string; samples: string[]; language: string; quickReply?: string; purpose?: string };

// Staff wording is rewritten into utility language before it goes to Meta: the first click asks AI for a
// utility rewrite (shown for review), the next click submits. Marketing submissions skip the rewrite.
export default function TemplateSubmitDialog({ open, onOpenChange, draft, onSubmitted }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: TemplateDraft;
  onSubmitted: () => void;
}) {
  const { toast } = useToast();
  const rewrite = useServerFn(rewriteTemplateForUtility);
  const submit = useServerFn(submitWhatsAppTemplate);
  const [templateKey, setTemplateKey] = useState(draft.templateKey);
  const [category, setCategory] = useState<TemplateCategory>("UTILITY");
  const [language, setLanguage] = useState(draft.language);
  const [body, setBody] = useState(draft.body);
  const [samples, setSamples] = useState(draft.samples);
  const [quickReply, setQuickReply] = useState(draft.quickReply ?? "");
  const [checkedBody, setCheckedBody] = useState<string | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [changes, setChanges] = useState<string[]>([]);
  const [rewriteSource, setRewriteSource] = useState<"ai" | "rules" | null>(null);
  const [busy, setBusy] = useState<"rewrite" | "submit" | null>(null);

  useEffect(() => {
    if (!open) return;
    setTemplateKey(draft.templateKey); setCategory("UTILITY"); setLanguage(draft.language); setBody(draft.body);
    setSamples(draft.samples); setQuickReply(draft.quickReply ?? ""); setCheckedBody(null); setOriginal(null); setChanges([]); setRewriteSource(null);
  }, [open, draft]);

  const positions = useMemo(() => placeholdersOf(body), [body]);
  const issues = useMemo(() => (category === "UTILITY" ? utilityIssues(body) : []), [category, body]);
  // One rewrite per draft; afterwards staff may edit freely or restore their own wording (rule hints stay live).
  const needsRewrite = category === "UTILITY" && checkedBody === null;

  const runRewrite = async () => {
    setBusy("rewrite");
    try {
      const result = await rewrite({ data: { body, purpose: draft.purpose, quickReply: quickReply.trim() || undefined } });
      setRewriteSource(result.source);
      setChanges(result.changes);
      if (result.body !== body) { setOriginal(body); setBody(result.body); }
      setCheckedBody(result.body);
    } catch (error) {
      toast({ title: "Utility rewrite failed", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally { setBusy(null); }
  };

  const runSubmit = async () => {
    setBusy("submit");
    try {
      const result = await submit({ data: {
        templateKey: templateKey.trim(), body, category, language: language.trim(),
        sampleValues: positions.map((_, i) => samples[i]?.trim() ?? ""), quickReply: quickReply.trim() || undefined,
      } });
      if (!result.ok) throw new Error(result.error);
      const v = result.version;
      toast({
        title: `${v.provider_template_name} submitted`,
        description: v.category !== v.requested_category ? `Meta accepted it as ${v.category}, not ${v.requested_category}.` : `Requested as ${v.category}; Meta review is in progress.`,
      });
      onOpenChange(false);
      onSubmitted();
    } catch (error) {
      toast({ title: "Submission failed", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally { setBusy(null); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Submit a WhatsApp template</DialogTitle>
          <DialogDescription>Each submission creates a new Meta template version. Utility wording is checked and rewritten before it is sent for review.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="template-key">Template key</Label><Input id="template-key" value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} placeholder="course_welcome" /></div>
            <div className="space-y-2"><Label htmlFor="template-language">Language</Label><Input id="template-language" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en_US" /></div>
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={(value) => setCategory(value as TemplateCategory)}>
              <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="UTILITY">Utility: about the learner's own enrollment</SelectItem>
                <SelectItem value="MARKETING">Marketing: promotional or re-engagement</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {category === "UTILITY"
                ? "Utility must be non-promotional and specific to the learner: enrollment confirmations, a lesson that is ready, schedule or progress updates. Offers, recommendations, \"we miss you\" or unclear content are billed as marketing, and Meta can approve a utility request as marketing."
                : "Marketing covers promotion, recommendations and re-engagement. It costs more and learners can limit how many they receive."}
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between"><Label htmlFor="template-body">Message</Label>
              {original && <Button type="button" variant="ghost" size="sm" onClick={() => { setBody(original); setCheckedBody(original); setOriginal(null); }}><Undo2 className="mr-1 h-3 w-3" /> Restore my wording</Button>}
            </div>
            <Textarea id="template-body" value={body} onChange={(e) => setBody(e.target.value)} rows={5} />
            <p className="text-xs text-muted-foreground">{"{{1}}"} is the learner's name and {"{{2}}"} the course title.</p>
          </div>
          {rewriteSource === "ai" && checkedBody === body && (
            <Alert><Sparkles className="h-4 w-4" /><AlertTitle>{original ? "Rewritten in utility language" : "Already reads as utility"}</AlertTitle>
              {changes.length > 0 && <AlertDescription><ul className="list-disc pl-4 text-xs">{changes.map((c) => <li key={c}>{c}</li>)}</ul></AlertDescription>}
            </Alert>
          )}
          {rewriteSource === "rules" && checkedBody === body && (
            <p className="text-xs text-muted-foreground">AI rewriting is unavailable right now; review the hints below before submitting.</p>
          )}
          {issues.length > 0 && (
            <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>May be categorized as marketing</AlertTitle>
              <AlertDescription><ul className="list-disc pl-4 text-xs">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></AlertDescription>
            </Alert>
          )}
          {positions.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {positions.map((position, i) => (
                <div key={position} className="space-y-2"><Label htmlFor={`sample-${position}`}>Sample for {`{{${position}}}`}</Label>
                  <Input id={`sample-${position}`} value={samples[i] ?? ""} onChange={(e) => setSamples(positions.map((_, j) => (j === i ? e.target.value : samples[j] ?? "")))} />
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2"><Label htmlFor="quick-reply">Quick-reply button (optional)</Label><Input id="quick-reply" value={quickReply} maxLength={25} onChange={(e) => setQuickReply(e.target.value)} placeholder="Start" />
            <p className="text-xs text-muted-foreground">Nudge templates need a button such as "Start" so the learner's tap resumes the course.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {needsRewrite ? (
            <Button onClick={runRewrite} disabled={busy !== null}>{busy === "rewrite" ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} Rewrite as utility</Button>
          ) : (
            <Button onClick={runSubmit} disabled={busy !== null}>{busy === "submit" ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Submit to Meta</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
