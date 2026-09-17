import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '@/components/dashboard/Sidebar';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { AlertCircle, CheckCircle2, Clock3, FileClock, RefreshCw, Send, Webhook } from 'lucide-react';

const statusVariant = (status: string) => {
  const normalized = status.toLowerCase();
  if (['processed', 'approved', 'delivered', 'read'].includes(normalized)) return 'default';
  if (['error', 'failed', 'rejected'].includes(normalized)) return 'destructive';
  return 'secondary';
};

const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString() : '—';

export default function WhatsAppWebhookStatus() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [body, setBody] = useState('Hello {{1}}, welcome to {{2}}. Your first lesson is ready. Reply to this message if you need help.');
  const [samples, setSamples] = useState(['Abheejit', 'WhatsApp Learning Essentials']);

  const query = useQuery({
    queryKey: ['whatsapp-diagnostics'],
    queryFn: async () => {
      const { data: role, error: roleError } = await supabase.from('user_roles').select('role,status').maybeSingle();
      if (roleError) throw roleError;
      if (!role || role.status !== 'active' || !['admin', 'content_creator'].includes(role.role)) throw new Error('Staff access required');
      const [callbacksResult, versionsResult, jobsResult, eventsResult] = await Promise.all([
        supabase.from('whatsapp_webhook_callbacks').select('*').order('received_at', { ascending: false }).limit(50),
        supabase.from('whatsapp_template_versions').select('*').eq('template_key', 'course_welcome').order('version', { ascending: false }),
        supabase.from('whatsapp_template_send_jobs').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('whatsapp_template_events').select('*').order('created_at', { ascending: false }).limit(50),
      ]);
      const error = callbacksResult.error || versionsResult.error || jobsResult.error || eventsResult.error;
      if (error) throw error;
      return { callbacks: callbacksResult.data, versions: versionsResult.data, jobs: jobsResult.data, events: eventsResult.data };
    },
    refetchInterval: 5000,
  });

  const checkMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('whatsapp-template-monitor', { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['whatsapp-diagnostics'] });
      toast({ title: 'Meta status checked', description: `course_welcome is ${data.state || 'updated'}.` });
    },
    onError: (error) => toast({ title: 'Status check failed', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('whatsapp-api', { body: { endpoint: 'submitTemplateVersion', body, sampleValues: samples } });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      setEditorOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['whatsapp-diagnostics'] });
      toast({ title: 'New version submitted', description: 'Meta review tracking is now active for the new version.' });
    },
    onError: (error) => toast({ title: 'Submission failed', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }),
  });

  const callbacks = query.data?.callbacks || [];
  const versions = query.data?.versions || [];
  const jobs = query.data?.jobs || [];
  const events = query.data?.events || [];
  const activeVersion = versions.find((version) => version.is_active);
  const latestJob = jobs[0];
  const lastProcessed = callbacks.find((callback) => callback.status === 'processed');
  const lastError = callbacks.find((callback) => callback.status === 'error');

  const openRevision = () => {
    if (activeVersion) {
      setBody(activeVersion.body);
      setSamples(Array.isArray(activeVersion.sample_values) ? activeVersion.sample_values.map(String) : []);
    }
    setEditorOpen(true);
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 py-6 md:px-6">
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold">Meta Templates & Delivery</h1>
              <p className="text-muted-foreground">Submit templates, follow Meta review live, and inspect message delivery.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => checkMutation.mutate()} disabled={checkMutation.isPending}>
                <RefreshCw className={`mr-2 h-4 w-4 ${checkMutation.isPending ? 'animate-spin' : ''}`} /> Check Meta
              </Button>
              <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
                <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} /> Refresh
              </Button>
            </div>
          </header>

          {query.error && <Alert variant="destructive" className="mb-6"><AlertCircle className="h-4 w-4" /><AlertTitle>Diagnostics unavailable</AlertTitle><AlertDescription>{query.error instanceof Error ? query.error.message : 'Could not load diagnostics.'}</AlertDescription></Alert>}

          <section className="mb-6 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div><h2 className="text-lg font-semibold">Template approval</h2><p className="text-sm text-muted-foreground">The active version is checked automatically every five minutes.</p></div>
               <Button onClick={openRevision}><FileClock className="mr-2 h-4 w-4" /> {activeVersion?.review_status === 'REJECTED' ? 'Revise and resubmit' : 'Submit new version'}</Button>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Active version</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold">{activeVersion ? `v${activeVersion.version}` : 'Not imported'}</div><p className="mt-1 text-xs text-muted-foreground">{activeVersion?.provider_template_name || 'course_welcome'}</p></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Meta review</CardTitle></CardHeader><CardContent><Badge variant={statusVariant(activeVersion?.review_status || 'pending')}>{activeVersion?.review_status || 'Waiting'}</Badge><p className="mt-2 text-xs text-muted-foreground">Checked {formatDate(activeVersion?.last_checked_at)}</p></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Automatic send</CardTitle></CardHeader><CardContent><Badge variant={statusVariant(latestJob?.status || 'queued')}>{latestJob?.status || 'Waiting for approval'}</Badge><p className="mt-2 text-xs text-muted-foreground">To +91 97660 72308</p></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">WhatsApp message ID</CardTitle></CardHeader><CardContent><p className="break-all font-mono text-xs">{latestJob?.provider_message_id || 'Created after Meta accepts the send'}</p></CardContent></Card>
            </div>
            {activeVersion?.rejection_reason && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Meta requested changes</AlertTitle><AlertDescription>{activeVersion.rejection_reason}</AlertDescription></Alert>}
          </section>

          <Card className="mb-6">
            <CardHeader><CardTitle>Live Meta status feed</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Version</TableHead><TableHead>Name</TableHead><TableHead>Status</TableHead><TableHead>Submitted</TableHead><TableHead>Last checked</TableHead></TableRow></TableHeader><TableBody>
              {versions.map((version) => <TableRow key={version.id}><TableCell>v{version.version}{version.is_active ? ' · active' : ''}</TableCell><TableCell className="font-mono text-xs">{version.provider_template_name}</TableCell><TableCell><Badge variant={statusVariant(version.review_status)}>{version.review_status}</Badge></TableCell><TableCell>{formatDate(version.submitted_at)}</TableCell><TableCell>{formatDate(version.last_checked_at)}</TableCell></TableRow>)}
              {!query.isLoading && versions.length === 0 && <TableRow><TableCell colSpan={5} className="h-20 text-center text-muted-foreground">The current Meta template has not been imported yet.</TableCell></TableRow>}
            </TableBody></Table></CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader><CardTitle className="flex items-center gap-2"><Send className="h-5 w-5" /> Send and delivery audit</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Event</TableHead><TableHead>Status</TableHead><TableHead>Message ID</TableHead></TableRow></TableHeader><TableBody>
              {events.map((event) => { const details = event.details && typeof event.details === 'object' && !Array.isArray(event.details) ? event.details : {}; const messageId = 'provider_message_id' in details ? String(details.provider_message_id || '') : ''; return <TableRow key={event.id}><TableCell className="whitespace-nowrap">{formatDate(event.created_at)}</TableCell><TableCell>{event.event_type.replace(/_/g, ' ')}</TableCell><TableCell><Badge variant={statusVariant(event.status)}>{event.status}</Badge></TableCell><TableCell className="max-w-[320px] truncate font-mono text-xs" title={messageId}>{messageId || '—'}</TableCell></TableRow>; })}
              {!query.isLoading && events.length === 0 && <TableRow><TableCell colSpan={4} className="h-20 text-center text-muted-foreground">No template activity yet.</TableCell></TableRow>}
            </TableBody></Table></CardContent>
          </Card>

          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Connection destination</CardTitle><Webhook className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-xl font-semibold">microlearn</div><p className="mt-1 text-xs text-muted-foreground">Selected for incoming WhatsApp messages</p></CardContent></Card>
            <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Last successful callback</CardTitle><CheckCircle2 className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-sm font-semibold">{lastProcessed ? formatDate(lastProcessed.processed_at || lastProcessed.received_at) : 'Waiting for first callback'}</div></CardContent></Card>
            <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Last error</CardTitle><AlertCircle className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-sm font-semibold">{lastError?.error_message || 'No callback errors'}</div></CardContent></Card>
          </div>

          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5" /> Recent callbacks</CardTitle></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Received</TableHead><TableHead>Delivery ID</TableHead><TableHead>Type</TableHead><TableHead>Phone</TableHead><TableHead>Status</TableHead><TableHead>Message ID</TableHead><TableHead>Error</TableHead></TableRow></TableHeader><TableBody>
            {callbacks.map((callback) => <TableRow key={callback.id}><TableCell className="whitespace-nowrap">{formatDate(callback.received_at)}</TableCell><TableCell className="max-w-[180px] truncate font-mono text-xs" title={callback.delivery_id}>{callback.delivery_id}</TableCell><TableCell>{callback.event_type}</TableCell><TableCell>{callback.phone_number || '—'}</TableCell><TableCell><Badge variant={statusVariant(callback.status)}>{callback.status}</Badge></TableCell><TableCell className="max-w-[220px] truncate font-mono text-xs" title={callback.provider_message_id || undefined}>{callback.provider_message_id || '—'}</TableCell><TableCell className="max-w-[220px] truncate" title={callback.error_message || undefined}>{callback.error_message || '—'}</TableCell></TableRow>)}
            {!query.isLoading && callbacks.length === 0 && <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Waiting for the first incoming callback.</TableCell></TableRow>}
          </TableBody></Table></CardContent></Card>
        </div>
      </main>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}><DialogContent><DialogHeader><DialogTitle>Submit the next course_welcome version</DialogTitle><DialogDescription>Each submission creates a new Meta template version and preserves the complete audit history.</DialogDescription></DialogHeader>
        <div className="space-y-4"><div className="space-y-2"><Label htmlFor="template-body">Message</Label><Textarea id="template-body" value={body} onChange={(event) => setBody(event.target.value)} rows={5} /></div>
          <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="sample-1">Sample for {'{{1}}'}</Label><Input id="sample-1" value={samples[0] || ''} onChange={(event) => setSamples([event.target.value, samples[1] || ''])} /></div><div className="space-y-2"><Label htmlFor="sample-2">Sample for {'{{2}}'}</Label><Input id="sample-2" value={samples[1] || ''} onChange={(event) => setSamples([samples[0] || '', event.target.value])} /></div></div>
        </div><DialogFooter><Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button><Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>{submitMutation.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Submit to Meta</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
}