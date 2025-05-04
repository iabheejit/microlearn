
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Send, Code, Plus, Save, Check } from "lucide-react";
import { WhatsAppTemplate } from "@/lib/types";
import { useToast } from "@/components/ui/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sendTestMessage } from "@/services/whatsappService";

interface WhatsAppIntegrationProps {
  templates?: WhatsAppTemplate[];
  contacts?: any[];
  isConfigured?: boolean;
}

const WhatsAppIntegration = ({ 
  templates = [], 
  contacts = [],
  isConfigured = false 
}: WhatsAppIntegrationProps) => {
  const { toast } = useToast();
  const [recipient, setRecipient] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [message, setMessage] = useState("");
  const [parameters, setParameters] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  // Set message content when template is selected
  const handleTemplateChange = (templateName: string) => {
    setSelectedTemplate(templateName);
    const template = templates.find(t => t.name === templateName);
    if (template) {
      setMessage(template.content);
      // Initialize parameters array with empty strings based on variables count
      setParameters(new Array(template.variables.length).fill(""));
    } else {
      setMessage("");
      setParameters([]);
    }
  };

  // Update a specific parameter value
  const handleParameterChange = (index: number, value: string) => {
    const newParameters = [...parameters];
    newParameters[index] = value;
    setParameters(newParameters);
  };

  // Send test message
  const handleSendTest = async () => {
    if (!recipient || !selectedTemplate) {
      toast({
        title: "Missing information",
        description: "Please select a recipient and template",
        variant: "destructive"
      });
      return;
    }

    try {
      setSending(true);
      await sendTestMessage(recipient, selectedTemplate, parameters);
      toast({
        title: "Message sent",
        description: "Test message has been sent successfully!"
      });
    } catch (error) {
      toast({
        title: "Failed to send message",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 animate-fade-in">
          <CardHeader>
            <CardTitle>WhatsApp Configuration</CardTitle>
            <CardDescription>
              Your WhatsApp Business API connection status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 p-4 bg-emerald-50 text-emerald-700 rounded-md">
              <Check className="h-5 w-5" />
              <p>Your WhatsApp Business API is connected and active</p>
            </div>
            
            <div className="space-y-2">
              <Label>API Endpoint</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value="https://live-mt-server.wati.io/8076"
                  className="bg-muted"
                />
                <Button variant="outline" size="icon" onClick={() => {
                  navigator.clipboard.writeText("https://live-mt-server.wati.io/8076");
                  toast({ title: "API endpoint copied to clipboard" });
                }}>
                  <Code size={16} />
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Tenant ID</Label>
              <Input
                readOnly
                value="8076"
                className="bg-muted"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value="https://api.ekatra.io/webhooks/whatsapp"
                />
                <Button variant="outline" size="icon" onClick={() => {
                  navigator.clipboard.writeText("https://api.ekatra.io/webhooks/whatsapp");
                  toast({ title: "Webhook URL copied to clipboard" });
                }}>
                  <Code size={16} />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Configure this URL in your WATI dashboard to receive messages.
              </p>
            </div>
          </CardContent>
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
              <span className="text-sm text-muted-foreground">Templates</span>
              <span className="text-lg font-semibold">{templates.length}</span>
            </div>
            <div className="flex justify-between items-center pb-4 border-b">
              <span className="text-sm text-muted-foreground">Contacts</span>
              <span className="text-lg font-semibold">{contacts.length}</span>
            </div>
            <div className="flex justify-between items-center pb-4 border-b">
              <span className="text-sm text-muted-foreground">Active</span>
              <span className="text-lg font-semibold">
                {templates.filter(t => t.status === "approved").length} templates
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Pending Approval</span>
              <span className="text-lg font-semibold">
                {templates.filter(t => t.status === "pending").length} templates
              </span>
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
                    View and manage your WhatsApp message templates.
                  </CardDescription>
                </div>
                <Button disabled>
                  <Plus className="mr-2 h-4 w-4" /> New Template
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {templates.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No templates found. Templates must be created in your WATI dashboard.
                  </div>
                ) : (
                  templates.map((template) => (
                    <div key={template.id} className="rounded-lg border p-4 hover:bg-accent/50 transition-colors">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium">{template.name}</h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            {template.variables.length} variables
                          </p>
                        </div>
                        <Badge variant="outline" className={
                          template.status === "approved" 
                            ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" 
                            : template.status === "rejected"
                            ? "bg-red-100 text-red-800 hover:bg-red-100"
                            : "bg-amber-100 text-amber-800 hover:bg-amber-100"
                        }>
                          {template.status.charAt(0).toUpperCase() + template.status.slice(1)}
                        </Badge>
                      </div>
                      <div className="mt-4 p-3 bg-muted rounded-md text-sm">
                        {template.content}
                      </div>
                      <div className="mt-4 flex gap-2">
                        <Button variant="outline" size="sm">Preview</Button>
                      </div>
                    </div>
                  ))
                )}
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
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the full number with country code (e.g., +919876543210)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="template">Template</Label>
                  <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map(template => (
                        <SelectItem key={template.id} value={template.name}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {parameters.length > 0 && (
                  <div className="space-y-2">
                    <Label>Template Parameters</Label>
                    {parameters.map((param, index) => (
                      <div key={index} className="mt-2">
                        <Label htmlFor={`param-${index}`}>Parameter {index + 1}</Label>
                        <Input
                          id={`param-${index}`}
                          value={param}
                          onChange={(e) => handleParameterChange(index, e.target.value)}
                          placeholder={`Value for {{${index + 1}}}`}
                        />
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="message">Preview</Label>
                  <Textarea
                    id="message"
                    value={message}
                    readOnly
                    rows={5}
                    className="bg-muted"
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full sm:w-auto" 
                onClick={handleSendTest}
                disabled={sending}
              >
                {sending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" /> Send Test Message
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WhatsAppIntegration;
