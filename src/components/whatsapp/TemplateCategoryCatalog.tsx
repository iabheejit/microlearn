import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { categoryState, utilityIssues } from "@/lib/whatsapp-template-category";
import { listTemplateCatalog } from "@/lib/whatsapp-templates.functions";
import type { WabaTemplate } from "@/lib/whatsapp-templates.server";
import { AlertCircle, RefreshCw, Sparkles, Tags } from "lucide-react";

// Every template on the linked WABA with Meta's category and correct_category, so staff see templates
// billed (or about to be billed) as marketing and can rewrite them as utility.
export default function TemplateCategoryCatalog({ onRewrite }: { onRewrite: (template: WabaTemplate) => void }) {
  const listCatalog = useServerFn(listTemplateCatalog);
  const query = useQuery({ queryKey: ["whatsapp-template-catalog"], queryFn: () => listCatalog(), staleTime: 60_000, retry: false });
  const templates = (query.data ?? []).filter((t) => t.category !== "AUTHENTICATION");
  const rows = templates.map((t) => ({ t, state: categoryState({ category: t.category, correctCategory: t.correctCategory }), issues: utilityIssues(t.body) }));
  const flagged = rows.filter((r) => r.t.category === "MARKETING" || r.state.state !== "ok");

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2"><Tags className="h-5 w-5" /> Template categories</CardTitle>
        <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> Sync from Meta
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Templates unavailable</AlertTitle><AlertDescription>{query.error instanceof Error ? query.error.message : "Could not load templates from WhatsApp."}</AlertDescription></Alert>}
        {flagged.length > 0 && (
          <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>{flagged.length} template{flagged.length === 1 ? " is" : "s are"} billed or about to be billed as marketing</AlertTitle>
            <AlertDescription>Rewrite them as utility: non-promotional and about the learner's own enrollment. Meta can also review a category from Business Support within 60 days.</AlertDescription>
          </Alert>
        )}
        <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Template</TableHead><TableHead>Status</TableHead><TableHead>Category</TableHead><TableHead>Wording</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>
          {rows.map(({ t, state, issues }) => (
            <TableRow key={t.id}>
              <TableCell><div className="font-mono text-xs">{t.name}</div><div className="text-xs text-muted-foreground">{t.language}</div></TableCell>
              <TableCell><Badge variant={t.status === "APPROVED" ? "default" : t.status === "REJECTED" ? "destructive" : "secondary"}>{t.status || "—"}</Badge></TableCell>
              <TableCell>
                <Badge variant={t.category === "MARKETING" ? "destructive" : "secondary"}>{t.category ?? "—"}</Badge>
                {state.state === "pending_change" && <div className="mt-1 text-xs text-destructive">Meta will change it to {state.correctCategory}</div>}
              </TableCell>
              <TableCell className="max-w-[320px]"><p className="truncate text-xs" title={t.body}>{t.body || "—"}</p>
                {issues.length > 0 && <p className="text-xs text-destructive" title={issues.join("\n")}>{issues.length} marketing signal{issues.length === 1 ? "" : "s"}</p>}
              </TableCell>
              <TableCell className="text-right">{t.body && <Button size="sm" variant={t.category === "UTILITY" && state.state === "ok" && !issues.length ? "ghost" : "default"} onClick={() => onRewrite(t)}><Sparkles className="mr-1 h-3 w-3" /> Rewrite as utility</Button>}</TableCell>
            </TableRow>
          ))}
          {!query.isLoading && rows.length === 0 && <TableRow><TableCell colSpan={5} className="h-20 text-center text-muted-foreground">No templates on the WhatsApp connection yet.</TableCell></TableRow>}
        </TableBody></Table></div>
      </CardContent>
    </Card>
  );
}
