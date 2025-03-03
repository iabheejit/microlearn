
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Send, Code, Plus, Save } from "lucide-react";

const WhatsAppIntegration = () => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 animate-fade-in">
          <CardHeader>
            <CardTitle>WhatsApp Configuration</CardTitle>
            <CardDescription>
              Connect your WhatsApp Business API account to start sending messages.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone_number_id">Phone Number ID</Label>
              <Input
                id="phone_number_id"
                placeholder="Enter your WhatsApp phone number ID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="business_account_id">Business Account ID</Label>
              <Input
                id="business_account_id"
                placeholder="Enter your WhatsApp business account ID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="access_token">Access Token</Label>
              <Input
                id="access_token"
                type="password"
                placeholder="Enter your WhatsApp access token"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="webhook_url">Webhook URL</Label>
              <div className="flex gap-2">
                <Input
                  id="webhook_url"
                  readOnly
                  value="https://api.ekatra.io/webhooks/whatsapp"
                />
                <Button variant="outline" size="icon">
                  <Code size={16} />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Configure this URL in your WhatsApp Business API dashboard to receive messages.
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full sm:w-auto">Save Configuration</Button>
          </CardFooter>
        </Card>

        <Card className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <CardHeader>
            <CardTitle>Quick Stats</CardTitle>
            <CardDescription>
              Overview of your WhatsApp messaging activity.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center pb-4 border-b">
              <span className="text-sm text-muted-foreground">Messages Sent</span>
              <span className="text-lg font-semibold">2,543</span>
            </div>
            <div className="flex justify-between items-center pb-4 border-b">
              <span className="text-sm text-muted-foreground">Messages Received</span>
              <span className="text-lg font-semibold">1,862</span>
            </div>
            <div className="flex justify-between items-center pb-4 border-b">
              <span className="text-sm text-muted-foreground">Active Sessions</span>
              <span className="text-lg font-semibold">128</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Response Rate</span>
              <span className="text-lg font-semibold">92%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="templates" className="animate-fade-in" style={{ animationDelay: "0.2s" }}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="templates">Message Templates</TabsTrigger>
          <TabsTrigger value="tester">Message Tester</TabsTrigger>
        </TabsList>
        <TabsContent value="templates" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Message Templates</CardTitle>
                  <CardDescription>
                    Create and manage your WhatsApp message templates.
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
                        Sent when a new user joins a course
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Approved</Badge>
                  </div>
                  <div className="mt-4 p-3 bg-muted rounded-md text-sm">
                    Hello, {{1}}! Welcome to {{2}}. Your course starts on {{3}}. Reply INFO for more details.
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
                        Delivers daily course content
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Approved</Badge>
                  </div>
                  <div className="mt-4 p-3 bg-muted rounded-md text-sm">
                    Today's lesson: {{1}}
                    
                    {{2}}
                    
                    Reply with your answer to the question above.
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
              <CardTitle>Message Tester</CardTitle>
              <CardDescription>
                Test your WhatsApp messages before sending them to users.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="recipient">Recipient Phone Number</Label>
                  <Input
                    id="recipient"
                    placeholder="+1234567890"
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
                    placeholder="Enter your message..."
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

export default WhatsAppIntegration;
