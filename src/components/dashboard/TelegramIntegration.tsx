import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Send } from "lucide-react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { fetchTelegramAnalytics, sendTelegramMessage } from "@/services/telegramService";

const TelegramIntegration = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [chatId, setChatId] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const stats = useQuery({ queryKey: ["telegram-analytics"], queryFn: fetchTelegramAnalytics });

  const handleSend = async () => {
    if (!chatId.trim() || !message.trim()) return;
    setSending(true);
    try {
      await sendTelegramMessage(chatId.trim(), message.trim());
      toast({ title: "Message sent", description: "It will appear in Chat History." });
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["telegram-analytics"] });
    } catch (error) {
      toast({ title: "Send failed", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const rows: Array<[string, number | undefined]> = [
    ["Messages Sent", stats.data?.outgoing],
    ["Messages Received", stats.data?.incoming],
    ["Users", stats.data?.uniqueUsers],
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Telegram Bot Connection</CardTitle>
            <CardDescription>
              The bot is connected through Lovable Connectors. Its token is stored securely there, not on this page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>To change the bot, update the Telegram connection in Connectors.</p>
            <p>Incoming messages are received automatically by this portal and appear in Chat History.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bot Stats</CardTitle>
            <CardDescription>Live activity from stored Telegram messages.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats.isError ? (
              <p className="text-sm text-destructive">Could not load stats.</p>
            ) : (
              rows.map(([label, value]) => (
                <div key={label} className="flex justify-between items-center pb-4 border-b last:border-0">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="text-lg font-semibold">{stats.isLoading ? "…" : (value ?? 0).toLocaleString()}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Send Test Message</CardTitle>
          <CardDescription>The person must have messaged the bot first so their chat ID is known.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="chat_id">Telegram Chat ID</Label>
            <Input id="chat_id" placeholder="e.g. 123456789" value={chatId} onChange={(e) => setChatId(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea id="message" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <Button onClick={handleSend} disabled={sending || !chatId.trim() || !message.trim()}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send Test Message
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default TelegramIntegration;
