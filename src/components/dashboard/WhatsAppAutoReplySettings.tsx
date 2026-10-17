import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { updateWhatsAppBotSettings } from "@/lib/whatsapp-send.functions";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

type Settings = {
  fallback_enabled: boolean;
  fallback_message: string;
  cooldown_minutes: number;
  handoff_message: string;
};

/** Staff card for the reply sent when a WhatsApp message matches no course step. */
export default function WhatsAppAutoReplySettings() {
  const { toast } = useToast();
  const save = useServerFn(updateWhatsAppBotSettings);
  const [form, setForm] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["whatsapp-bot-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_bot_settings")
        .select(
          "fallback_enabled,fallback_message,cooldown_minutes,handoff_message",
        )
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await save({ data: form });
      await refetch();
      toast({ title: "Auto-reply settings saved" });
    } catch (saveError) {
      toast({
        title: "Could not save settings",
        description:
          saveError instanceof Error ? saveError.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Unmatched message replies</CardTitle>
        <CardDescription>
          When a learner's message doesn't match a course step, they get this
          message with "My courses" and "Talk to a person" buttons, and the chat
          is flagged in Chat History.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : error || !form ? (
          <p className="text-sm text-destructive">
            Auto-reply settings could not be loaded.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Switch
                id="fallback-enabled"
                checked={form.fallback_enabled}
                onCheckedChange={(checked) =>
                  setForm({ ...form, fallback_enabled: checked })
                }
              />
              <Label htmlFor="fallback-enabled">
                Send the help menu (chats are flagged either way)
              </Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fallback-message">Help menu message</Label>
              <Textarea
                id="fallback-message"
                maxLength={1000}
                value={form.fallback_message}
                onChange={(e) =>
                  setForm({ ...form, fallback_message: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fallback-cooldown">
                Send the menu at most once every (minutes)
              </Label>
              <Input
                id="fallback-cooldown"
                type="number"
                min={0}
                max={1440}
                value={form.cooldown_minutes}
                onChange={(e) =>
                  setForm({ ...form, cooldown_minutes: Number(e.target.value) })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="handoff-message">
                Reply to "Talk to a person"
              </Label>
              <Textarea
                id="handoff-message"
                maxLength={1000}
                value={form.handoff_message}
                onChange={(e) =>
                  setForm({ ...form, handoff_message: e.target.value })
                }
              />
            </div>
          </>
        )}
      </CardContent>
      <CardFooter>
        <Button
          onClick={handleSave}
          disabled={
            !form ||
            saving ||
            !form.fallback_message.trim() ||
            !form.handoff_message.trim() ||
            !Number.isInteger(form.cooldown_minutes) ||
            form.cooldown_minutes < 0 ||
            form.cooldown_minutes > 1440
          }
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}
