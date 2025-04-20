
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Bot, Send, Code, Plus, Save } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";

const TelegramIntegration = () => {
  const { toast } = useToast();
  const [botToken, setBotToken] = useState("");
  const [botUsername, setBotUsername] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("https://api.ekatra.io/webhooks/telegram");
  
  const handleSaveConfig = () => {
    // In a real app, this would save to Supabase
    toast({
      title: "Configuration Saved",
      description: "Your Telegram bot configuration has been saved successfully."
    });
  };
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 animate-fade-in">
          <CardHeader>
            <CardTitle>Telegram Bot Configuration</CardTitle>
            <CardDescription>
              Connect your Telegram Bot to integrate with your learning platform.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bot_token">Bot Token</Label>
              <Input
                id="bot_token"
                type="password"
                placeholder="Enter your Telegram bot token"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Get this from @BotFather on Telegram when creating a new bot.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bot_username">Bot Username</Label>
              <Input
                id="bot_username"
                placeholder="Enter your bot's username (without @)"
                value={botUsername}
                onChange={(e) => setBotUsername(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="webhook_url">Webhook URL</Label>
              <div className="flex gap-2">
                <Input
                  id="webhook_url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                />
                <Button variant="outline" size="icon" onClick={() => {
                  navigator.clipboard.writeText(webhookUrl);
                  toast({ title: "Copied to clipboard" });
                }}>
                  <Code size={16} />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Set this URL as your bot's webhook using the Telegram Bot API.
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full sm:w-auto" onClick={handleSaveConfig}>Save Configuration</Button>
          </CardFooter>
        </Card>

        <Card className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <CardHeader>
            <CardTitle>Bot Stats</CardTitle>
            <CardDescription>
              Overview of your Telegram bot activity.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center pb-4 border-b">
              <span className="text-sm text-muted-foreground">Messages Sent</span>
              <span className="text-lg font-semibold">1,287</span>
            </div>
            <div className="flex justify-between items-center pb-4 border-b">
              <span className="text-sm text-muted-foreground">Messages Received</span>
              <span className="text-lg font-semibold">943</span>
            </div>
            <div className="flex justify-between items-center pb-4 border-b">
              <span className="text-sm text-muted-foreground">Active Users</span>
              <span className="text-lg font-semibold">76</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Response Rate</span>
              <span className="text-lg font-semibold">94%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="templates" className="animate-fade-in" style={{ animationDelay: "0.2s" }}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="templates">Message Templates</TabsTrigger>
          <TabsTrigger value="tester">Bot Tester</TabsTrigger>
        </TabsList>
        <TabsContent value="templates" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Bot Message Templates</CardTitle>
                  <CardDescription>
                    Create and manage your Telegram bot message templates.
                  </CardDescription>
                </div>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> New Template
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="rounded-lg border p-4 hover:bg-accent/50 transition-colors">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium">Welcome Message</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Sent when a user starts the bot
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Active</Badge>
                  </div>
                  <div className="mt-4 p-3 bg-muted rounded-md text-sm">
                    Hello {'{name}'}! Welcome to {'{course_name}'}. Your AI tutor is ready to assist you. Type /help to see available commands.
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" size="sm">Preview</Button>
                    <Button variant="outline" size="sm">Edit</Button>
                  </div>
                </div>

                <div className="rounded-lg border p-4 hover:bg-accent/50 transition-colors">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium">Daily Lesson</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Scheduled daily content delivery
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Active</Badge>
                  </div>
                  <div className="mt-4 p-3 bg-muted rounded-md text-sm">
                    📚 *Today's Lesson: {'{lesson_title}'}*

{'{lesson_content}'}

Reply with your questions or type /quiz to test your knowledge.
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" size="sm">Preview</Button>
                    <Button variant="outline" size="sm">Edit</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="tester" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Bot Message Tester</CardTitle>
              <CardDescription>
                Test your Telegram bot messages before sending them to users.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="user_id">Telegram User ID</Label>
                  <Input
                    id="user_id"
                    placeholder="Enter user's Telegram ID"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="template">Template</Label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2">
                    <option value="">Select a template...</option>
                    <option value="welcome">Welcome Message</option>
                    <option value="daily_lesson">Daily Lesson</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    placeholder="Enter your message... (Markdown supported)"
                    rows={5}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full sm:w-auto">
                <Send className="mr-2 h-4 w-4" /> Send Test Message
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TelegramIntegration;
