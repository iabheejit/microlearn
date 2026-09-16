import { useQuery } from '@tanstack/react-query';
import Sidebar from '@/components/dashboard/Sidebar';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, CheckCircle2, Clock3, RefreshCw, Webhook } from 'lucide-react';

const statusVariant = (status: string) => status === 'processed' ? 'default' : status === 'error' ? 'destructive' : 'secondary';

export default function WhatsAppWebhookStatus() {
  const query = useQuery({
    queryKey: ['whatsapp-webhook-callbacks'],
    queryFn: async () => {
      const { data: role, error: roleError } = await supabase.from('user_roles').select('role,status').maybeSingle();
      if (roleError) throw roleError;
      if (!role || role.status !== 'active' || !['admin', 'content_creator'].includes(role.role)) throw new Error('Staff access required');
      const { data, error } = await supabase.from('whatsapp_webhook_callbacks').select('*').order('received_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000,
  });

  const callbacks = query.data || [];
  const lastProcessed = callbacks.find((callback) => callback.status === 'processed');
  const lastError = callbacks.find((callback) => callback.status === 'error');

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 py-6 md:px-6">
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold">WhatsApp Webhook Status</h1>
              <p className="text-muted-foreground">Monitor incoming messages, delivery callbacks, and processing errors.</p>
            </div>
            <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </header>

          {query.error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Diagnostics unavailable</AlertTitle>
              <AlertDescription>{query.error instanceof Error ? query.error.message : 'Could not load callback status.'}</AlertDescription>
            </Alert>
          )}

          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Connection destination</CardTitle><Webhook className="h-4 w-4 text-muted-foreground" /></CardHeader>
              <CardContent><div className="text-xl font-semibold">microlearn</div><p className="mt-1 text-xs text-muted-foreground">Selected for incoming WhatsApp messages</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Last successful callback</CardTitle><CheckCircle2 className="h-4 w-4 text-muted-foreground" /></CardHeader>
              <CardContent><div className="text-sm font-semibold">{lastProcessed ? new Date(lastProcessed.processed_at || lastProcessed.received_at).toLocaleString() : 'Waiting for first callback'}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Last error</CardTitle><AlertCircle className="h-4 w-4 text-muted-foreground" /></CardHeader>
              <CardContent><div className="text-sm font-semibold">{lastError?.error_message || 'No callback errors'}</div></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5" /> Recent callbacks</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Received</TableHead><TableHead>Delivery ID</TableHead><TableHead>Type</TableHead><TableHead>Phone</TableHead><TableHead>Status</TableHead><TableHead>Error</TableHead></TableRow></TableHeader>
                <TableBody>
                  {callbacks.map((callback) => (
                    <TableRow key={callback.id}>
                      <TableCell className="whitespace-nowrap">{new Date(callback.received_at).toLocaleString()}</TableCell>
                      <TableCell className="max-w-[220px] truncate font-mono text-xs" title={callback.delivery_id}>{callback.delivery_id}</TableCell>
                      <TableCell>{callback.event_type}</TableCell>
                      <TableCell>{callback.phone_number || '—'}</TableCell>
                      <TableCell><Badge variant={statusVariant(callback.status)}>{callback.status}</Badge></TableCell>
                      <TableCell className="max-w-[260px] truncate" title={callback.error_message || undefined}>{callback.error_message || '—'}</TableCell>
                    </TableRow>
                  ))}
                  {!query.isLoading && callbacks.length === 0 && <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Waiting for the first incoming callback.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
