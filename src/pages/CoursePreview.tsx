import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/dashboard/Sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, MessageCircle, CreditCard } from "lucide-react";
import WhatsAppPreview from "@/components/dashboard/WhatsAppPreview";
import { MOCK_COURSES } from "@/lib/constants";
import { Course } from "@/lib/types";
import StripeCheckout from "@/components/dashboard/StripeCheckout";
import { fetchCourse } from "@/lib/api";

const CoursePreview = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("content");
  const [selectedDay, setSelectedDay] = useState(0);
  const [showPayment, setShowPayment] = useState(false);

  const { data: course, isLoading, error } = useQuery({
    queryKey: ['course', id],
    queryFn: () => fetchCourse(Number(id)),
    initialData: MOCK_COURSES.find(c => c.id === parseInt(id || "0"))
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto py-6 px-4 md:px-6">
            <div className="flex justify-center p-8">
              <p>Loading course...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto py-6 px-4 md:px-6">
            <div className="flex flex-col items-center justify-center h-[80vh] text-center">
              <h1 className="text-2xl font-bold mb-4">Course Not Found</h1>
              <p className="text-muted-foreground mb-6">
                {error ? `Error: ${(error as Error).message}` : "The course you're looking for doesn't exist or has been deleted."}
              </p>
              <Button onClick={() => navigate("/courses")}>
                Back to Courses
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto py-6 px-4 md:px-6">
          <div className="flex justify-between items-center mb-6">
            <Button variant="outline" onClick={() => navigate("/courses")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Courses
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardContent className="pt-6">
                  <h1 className="text-2xl font-bold mb-2">{course.title}</h1>
                  <div className="flex items-center mb-4">
                    <Badge
                      variant={
                        course.status === "active"
                          ? "default"
                          : course.status === "draft"
                          ? "outline"
                          : "secondary"
                      }
                    >
                      {course.status}
                    </Badge>
                    <span className="text-muted-foreground ml-4">
                      Created on {course.created}
                    </span>
                  </div>
                  <p className="text-muted-foreground mb-6">
                    {course.description || "No description available for this course."}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-muted rounded-lg p-4 text-center">
                      <p className="text-sm text-muted-foreground">Students Enrolled</p>
                      <p className="text-2xl font-bold">{course.enrolled}</p>
                    </div>
                    <div className="bg-muted rounded-lg p-4 text-center">
                      <p className="text-sm text-muted-foreground">Completion Rate</p>
                      <p className="text-2xl font-bold">{course.completion}%</p>
                    </div>
                    <div className="bg-muted rounded-lg p-4 text-center">
                      <p className="text-sm text-muted-foreground">Price</p>
                      <p className="text-2xl font-bold">${course.price || "0.00"}</p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <Button onClick={() => setShowPayment(true)}>
                      <CreditCard className="mr-2 h-4 w-4" />
                      Purchase Course
                    </Button>
                    <Button variant="outline" onClick={() => navigate(`/courses/editor/${course.id}`)}>
                      Edit Course
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <Tabs defaultValue="content" onValueChange={setActiveTab}>
                    <TabsList className="mb-6">
                      <TabsTrigger value="content">Course Content</TabsTrigger>
                      <TabsTrigger value="whatsapp">WhatsApp Preview</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="content">
                      <div className="space-y-4">
                        {course.days && course.days.length > 0 ? (
                          course.days.map((day, index) => (
                            <div 
                              key={day.id} 
                              className="p-4 border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors"
                              onClick={() => {
                                setSelectedDay(index);
                                setActiveTab("whatsapp");
                              }}
                            >
                              <h3 className="font-medium">{day.title}</h3>
                              <p className="text-sm text-muted-foreground mt-1">
                                {day.paragraphs.length} paragraph(s) {day.media ? "• Media included" : ""}
                              </p>
                            </div>
                          ))
                        ) : (
                          <div className="flex flex-col items-center justify-center py-10 text-center">
                            <p className="text-muted-foreground">No content available for this course.</p>
                            <Button 
                              variant="outline" 
                              className="mt-4"
                              onClick={() => navigate(`/courses/editor/${course.id}`)}
                            >
                              Add Course Content
                            </Button>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="whatsapp">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-medium">WhatsApp Preview</h3>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={selectedDay === 0}
                            onClick={() => setSelectedDay(selectedDay - 1)}
                          >
                            Previous Day
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!course.days || selectedDay === course.days.length - 1}
                            onClick={() => setSelectedDay(selectedDay + 1)}
                          >
                            Next Day
                          </Button>
                        </div>
                      </div>

                      {course.days && course.days.length > 0 ? (
                        <WhatsAppPreview course={course} selectedDay={selectedDay} />
                      ) : (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <p className="text-muted-foreground">No content available to preview.</p>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-1">
              {showPayment ? (
                <StripeCheckout 
                  course={course} 
                  onCancel={() => setShowPayment(false)} 
                />
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <h2 className="text-lg font-bold mb-4">Course Information</h2>
                    
                    <div className="space-y-4">
                      {course.instructor && (
                        <div>
                          <h3 className="text-sm font-medium text-muted-foreground">Instructor</h3>
                          <p>{course.instructor}</p>
                        </div>
                      )}
                      
                      {course.category && (
                        <div>
                          <h3 className="text-sm font-medium text-muted-foreground">Category</h3>
                          <p>{course.category}</p>
                        </div>
                      )}
                      
                      {course.language && (
                        <div>
                          <h3 className="text-sm font-medium text-muted-foreground">Language</h3>
                          <p>{course.language}</p>
                        </div>
                      )}
                      
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Delivery Method</h3>
                        <div className="flex items-center mt-1">
                          <MessageCircle className="h-4 w-4 mr-2 text-[#128C7E]" />
                          <p>WhatsApp Daily Lessons</p>
                        </div>
                      </div>
                      
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Duration</h3>
                        <p>{course.days ? course.days.length : 0} days</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CoursePreview;
