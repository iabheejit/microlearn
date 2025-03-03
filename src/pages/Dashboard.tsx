
import { useState } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Stats from "@/components/dashboard/Stats";
import CoursesList from "@/components/dashboard/CoursesList";
import { MOCK_STATS, MOCK_COURSES } from "@/lib/constants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { BookOpen, MessageCircle, Users } from "lucide-react";

const Dashboard = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto py-6 px-4 md:px-6">
          <header className="mb-6">
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">
              Welcome back, here's what's happening with your learning platform.
            </p>
          </header>

          <Stats stats={MOCK_STATS} />

          <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 animate-fade-in" style={{ animationDelay: "0.2s" }}>
              <CardHeader>
                <CardTitle>Recent Courses</CardTitle>
                <CardDescription>
                  Your most recent active courses
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CoursesList courses={MOCK_COURSES.slice(0, 3)} />
              </CardContent>
            </Card>

            <Card className="animate-fade-in" style={{ animationDelay: "0.3s" }}>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>
                  Frequently used operations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <button 
                    className="flex items-center w-full p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                    onClick={() => toast({ title: "New course feature coming soon!" })}
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mr-4">
                      <BookOpen size={20} className="text-primary" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-medium">New Course</h3>
                      <p className="text-sm text-muted-foreground">
                        Create a new learning course
                      </p>
                    </div>
                  </button>

                  <button 
                    className="flex items-center w-full p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                    onClick={() => toast({ title: "User management feature coming soon!" })}
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mr-4">
                      <Users size={20} className="text-primary" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-medium">Add Users</h3>
                      <p className="text-sm text-muted-foreground">
                        Invite new users to your platform
                      </p>
                    </div>
                  </button>

                  <button 
                    className="flex items-center w-full p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                    onClick={() => toast({ title: "WhatsApp integration feature coming soon!" })}
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mr-4">
                      <MessageCircle size={20} className="text-primary" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-medium">WhatsApp Setup</h3>
                      <p className="text-sm text-muted-foreground">
                        Configure your WhatsApp integration
                      </p>
                    </div>
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
