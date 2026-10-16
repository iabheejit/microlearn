
import { useState, useEffect } from "react";
import { useNavigate } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ArrowLeft, ArrowRight, Upload, Text, Calendar, Save, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Course, CourseDay, CourseParagraph } from "@/lib/types";
import WhatsAppPreview from "./WhatsAppPreview";
import { supabase } from "@/integrations/supabase/client";

const CATEGORIES = ["Programming", "Language", "Business", "Science", "Arts", "Mathematics"];
const LANGUAGES = ["English", "Spanish", "French", "Hindi", "Mandarin", "Arabic"];

interface CourseEditorProps {
  initialCourse?: Course;
  onSave: (course: Course) => void;
  isSaving?: boolean;
}

const CourseEditor = ({ initialCourse, onSave, isSaving = false }: CourseEditorProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [activeDay, setActiveDay] = useState(0);
  const [showPreview, setShowPreview] = useState(false);

  const emptyCourseDay: CourseDay = {
    id: crypto.randomUUID(),
    title: "Day 1",
    paragraphs: [{ id: crypto.randomUUID(), content: "" }],
  };
  
  const defaultCourse: Course = {
    id: crypto.randomUUID(),
    title: "",
    instructor: "",
    description: "",
    category: "",
    language: "",
    price: 0,
    enrolled: 0,
    completion: 0,
    status: "draft",
    created: new Date().toISOString().split('T')[0],
    days: [emptyCourseDay]
  };

  const [course, setCourse] = useState<Course>(initialCourse || defaultCourse);
  const [welcomeTemplates, setWelcomeTemplates] = useState<Array<{ key: string; language: string }>>([]);

  useEffect(() => {
    supabase.from("whatsapp_template_versions")
      .select("template_key,language")
      .eq("review_status", "APPROVED")
      .order("version", { ascending: false })
      .then(({ data }) => {
        const seen = new Map<string, string>();
        (data || []).forEach((row) => { if (!seen.has(row.template_key)) seen.set(row.template_key, row.language); });
        setWelcomeTemplates(Array.from(seen, ([key, language]) => ({ key, language })));
      });
  }, []);

  // Ensure days array is initialized
  useEffect(() => {
    if (!course.days || course.days.length === 0) {
      setCourse({
        ...course,
        days: [emptyCourseDay]
      });
    }
  }, [course]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCourse({ ...course, title: e.target.value });
  };

  const handleInstructorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCourse({ ...course, instructor: e.target.value });
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCourse({ ...course, description: e.target.value });
  };

  const handleCategoryChange = (value: string) => {
    setCourse({ ...course, category: value });
  };

  const handleLanguageChange = (value: string) => {
    setCourse({ ...course, language: value });
  };

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCourse({ ...course, price: parseFloat(e.target.value) || 0 });
  };

  const handleAddDay = () => {
    if (!course.days) {
      setCourse({
        ...course,
        days: [emptyCourseDay]
      });
      return;
    }
    
    const newDay: CourseDay = {
      id: crypto.randomUUID(),
      title: `Day ${course.days.length + 1}`,
      paragraphs: [{ id: crypto.randomUUID(), content: "" }],
    };
    
    const updatedDays = [...course.days, newDay];
    
    setCourse({
      ...course,
      days: updatedDays
    });
    
    // Set active day to the newly created day
    setActiveDay(updatedDays.length - 1);
    
    toast({
      title: "Day added",
      description: `Day ${course.days.length + 1} has been added to the course.`
    });
  };

  const handleRemoveDay = (dayIndex: number) => {
    if (!course.days || course.days.length <= 1) {
      toast({
        title: "Cannot remove",
        description: "A course must have at least one day",
        variant: "destructive"
      });
      return;
    }
    
    const updatedDays = course.days.filter((_, idx) => idx !== dayIndex);
    
    // Renumber the days
    updatedDays.forEach((day, idx) => {
      day.title = day.title.replace(/Day \d+/, `Day ${idx + 1}`);
    });
    
    setCourse({
      ...course,
      days: updatedDays
    });
    
    // Adjust active day if necessary
    if (activeDay >= updatedDays.length) {
      setActiveDay(updatedDays.length - 1);
    }
    
    toast({
      title: "Day removed",
      description: "The day has been removed from the course."
    });
  };

  const handleDayTitleChange = (content: string) => {
    if (!course.days) return;
    
    const updatedDays = [...course.days];
    updatedDays[activeDay] = {
      ...updatedDays[activeDay],
      title: content
    };
    
    setCourse({
      ...course,
      days: updatedDays
    });
  };

  const handleAddParagraph = () => {
    if (!course.days) return;
    
    const updatedDays = [...course.days];
    const currentDay = updatedDays[activeDay];
    
    currentDay.paragraphs = [
      ...currentDay.paragraphs,
      {
        id: crypto.randomUUID(),
        content: ""
      }
    ];
    
    setCourse({
      ...course,
      days: updatedDays
    });
    
    toast({
      title: "Paragraph added",
      description: "A new paragraph has been added to the day."
    });
  };

  const handleRemoveParagraph = (paragraphId: string) => {
    if (!course.days) return;
    
    const updatedDays = [...course.days];
    const currentDay = updatedDays[activeDay];
    
    if (currentDay.paragraphs.length <= 1) {
      toast({
        title: "Cannot remove",
        description: "A day must have at least one paragraph",
        variant: "destructive"
      });
      return;
    }
    
    currentDay.paragraphs = currentDay.paragraphs.filter(p => p.id !== paragraphId);
    
    setCourse({
      ...course,
      days: updatedDays
    });
    
    toast({
      title: "Paragraph removed",
      description: "The paragraph has been removed."
    });
  };

  const handleParagraphChange = (paragraphId: string, content: string) => {
    if (!course.days) return;
    
    const updatedDays = [...course.days];
    const currentDay = updatedDays[activeDay];
    
    const paragraphIndex = currentDay.paragraphs.findIndex(p => p.id === paragraphId);
    if (paragraphIndex === -1) return;
    
    currentDay.paragraphs[paragraphIndex].content = content;
    
    setCourse({
      ...course,
      days: updatedDays
    });
  };

  const handleMediaChange = (url: string) => {
    if (!course.days) return;
    
    const updatedDays = [...course.days];
    updatedDays[activeDay] = {
      ...updatedDays[activeDay],
      media: url
    };
    
    setCourse({
      ...course,
      days: updatedDays
    });
  };

  const handleSaveCourse = () => {
    if (!course.title) {
      toast({
        title: "Error",
        description: "Course title is required",
        variant: "destructive"
      });
      return;
    }

    if (!course.days || course.days.length === 0) {
      toast({
        title: "Error",
        description: "Course must have at least one day",
        variant: "destructive"
      });
      return;
    }

    onSave(course);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={() => navigate("/courses")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Courses
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowPreview(!showPreview)}>
            {showPreview ? "Hide Preview" : "Show WhatsApp Preview"}
          </Button>
          <Button onClick={handleSaveCourse} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Saving..." : "Save Course"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`${showPreview ? "lg:col-span-2" : "lg:col-span-3"} space-y-6`}>
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-2xl font-bold mb-6">Course Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Course Name*
                  </label>
                  <Input 
                    placeholder="Enter course name" 
                    value={course.title}
                    onChange={handleTitleChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Course Instructor/Educator
                  </label>
                  <Input 
                    placeholder="Enter instructor name" 
                    value={course.instructor || ""}
                    onChange={handleInstructorChange}
                  />
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Brief Description
                </label>
                <Textarea 
                  placeholder="Give brief about the course" 
                  value={course.description || ""}
                  onChange={handleDescriptionChange}
                  className="min-h-[100px]"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Category
                  </label>
                  <Select value={course.category} onValueChange={handleCategoryChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(category => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Language
                  </label>
                  <Select value={course.language} onValueChange={handleLanguageChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map(language => (
                        <SelectItem key={language} value={language}>
                          {language}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Price (USD)
                  </label>
                  <Input 
                    type="number" 
                    min="0" 
                    step="0.01" 
                    placeholder="0.00" 
                    value={course.price || ""}
                    onChange={handlePriceChange}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <h2 className="text-2xl font-bold">Delivery</h2>
                <p className="text-sm text-muted-foreground">Choose where learners take this course.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Channel</label>
                  <Select
                    value={course.deliveryChannel || "whatsapp"}
                    onValueChange={(value) => setCourse({ ...course, deliveryChannel: value as NonNullable<Course["deliveryChannel"]> })}
                  >
                    <SelectTrigger aria-label="Delivery channel"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="telegram">Telegram</SelectItem>
                      <SelectItem value="web">Web (learner dashboard)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {course.deliveryChannel === "web" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Who can join</label>
                    <Select
                      value={course.webEnrollmentMode || "invite"}
                      onValueChange={(value) => setCourse({ ...course, webEnrollmentMode: value as NonNullable<Course["webEnrollmentMode"]> })}
                    >
                      <SelectTrigger aria-label="Web enrollment"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="invite">Invited learners only</SelectItem>
                        <SelectItem value="open">Any signed-in learner</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              {course.deliveryChannel === "web" && (
                <p className="text-xs text-muted-foreground">Learners see published web courses at /learn. Invite learners by email from the course page.</p>
              )}
            </CardContent>
          </Card>

          {(course.deliveryChannel || "whatsapp") === "whatsapp" && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <h2 className="text-2xl font-bold">WhatsApp Messages</h2>
                <p className="text-sm text-muted-foreground">Choose what learners of this course receive on WhatsApp.</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Welcome template (sent when a learner is enrolled)</label>
                <Select
                  value={course.whatsappWelcomeTemplateKey || "course_welcome"}
                  onValueChange={(value) => setCourse({ ...course, whatsappWelcomeTemplateKey: value })}
                >
                  <SelectTrigger><SelectValue placeholder="Select approved template" /></SelectTrigger>
                  <SelectContent>
                    {Array.from(new Set(["course_welcome", ...welcomeTemplates.map((t) => t.key), course.whatsappWelcomeTemplateKey || "course_welcome"])).map((key) => {
                      const match = welcomeTemplates.find((t) => t.key === key);
                      return (
                        <SelectItem key={key} value={key}>
                          {key}{match ? ` (${match.language})` : " (not approved yet)"}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Only Meta-approved templates can be sent. The learner's name and course title fill the template's two fields.</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Lesson intro (added above every lesson)</label>
                <Textarea
                  placeholder="e.g. Here's your next bite-sized lesson 📘"
                  value={course.whatsappLessonIntro || ""}
                  onChange={(e) => setCourse({ ...course, whatsappLessonIntro: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Completion message</label>
                <Textarea
                  placeholder="Congratulations {{name}}! You finished {{course}}. Certificate code: {{code}}"
                  value={course.whatsappCompletionMessage || ""}
                  onChange={(e) => setCourse({ ...course, whatsappCompletionMessage: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Use {"{{name}}"}, {"{{course}}"} and {"{{code}}"}. The certificate code is always included.</p>
              </div>
            </CardContent>
          </Card>
          )}

          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Course Content</h2>
                <Button onClick={handleAddDay}>
                  <Calendar className="mr-2 h-4 w-4" />
                  Add Day
                </Button>
              </div>

              {course.days && course.days.length > 0 ? (
                <>
                  <div className="flex items-center space-x-2 mb-6 overflow-x-auto pb-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      disabled={activeDay === 0}
                      onClick={() => setActiveDay(activeDay - 1)}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    {course.days.map((day, idx) => (
                      <div key={day.id} className="flex items-center">
                        <Button
                          variant={activeDay === idx ? "default" : "outline"}
                          onClick={() => setActiveDay(idx)}
                          className="mr-1"
                        >
                          {day.title}
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleRemoveDay(idx)}
                          className="h-8 w-8"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      disabled={activeDay === course.days.length - 1}
                      onClick={() => setActiveDay(activeDay + 1)}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">
                        Day Title
                      </label>
                      <Input
                        value={course.days[activeDay].title}
                        onChange={(e) => handleDayTitleChange(e.target.value)}
                        placeholder="Enter day title"
                      />
                    </div>

                    {course.days[activeDay].paragraphs.map((paragraph, paragraphIndex) => (
                      <div key={paragraph.id} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-sm font-medium leading-none">
                            Paragraph {paragraphIndex + 1}
                          </label>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => handleRemoveParagraph(paragraph.id)}
                            className="h-8 w-8"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                        <Textarea
                          value={paragraph.content}
                          onChange={(e) => handleParagraphChange(paragraph.id, e.target.value)}
                          placeholder="Enter paragraph content"
                          className="min-h-[100px]"
                        />
                      </div>
                    ))}

                    <Button variant="outline" onClick={handleAddParagraph}>
                      <Text className="mr-2 h-4 w-4" />
                      Add Paragraph
                    </Button>

                    <div className="space-y-2 mt-6">
                      <label className="text-sm font-medium leading-none">
                        Media
                      </label>
                      <div className="flex gap-2">
                        <Input
                          value={course.days[activeDay].media || ""}
                          onChange={(e) => handleMediaChange(e.target.value)}
                          placeholder="Paste link to the media..."
                        />
                        <Button variant="outline" size="icon">
                          <Upload className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-40 text-center space-y-4">
                  <p className="text-muted-foreground">No days created yet.</p>
                  <Button onClick={handleAddDay}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add First Day
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {showPreview && (
          <Card className="lg:col-span-1">
            <CardContent className="pt-6">
              <h2 className="text-2xl font-bold mb-4">WhatsApp Preview</h2>
              <WhatsAppPreview course={course} selectedDay={activeDay} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default CourseEditor;
