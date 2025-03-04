
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, ArrowLeft, ArrowRight, Upload, Text, Calendar, Save } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Course, CourseDay, CourseParagraph } from "@/lib/types";
import WhatsAppPreview from "./WhatsAppPreview";

const CATEGORIES = ["Programming", "Language", "Business", "Science", "Arts", "Mathematics"];
const LANGUAGES = ["English", "Spanish", "French", "Hindi", "Mandarin", "Arabic"];

interface CourseEditorProps {
  initialCourse?: Course;
  onSave: (course: Course) => void;
}

const CourseEditor = ({ initialCourse, onSave }: CourseEditorProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [activeDay, setActiveDay] = useState(0);
  const [showPreview, setShowPreview] = useState(false);

  const emptyCourseDay: CourseDay = {
    id: 1,
    title: "Day 1",
    paragraphs: [{ id: 1, content: "" }],
  };
  
  const defaultCourse: Course = {
    id: Date.now(),
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
    if (!course.days) return;
    
    const newDay: CourseDay = {
      id: course.days.length + 1,
      title: `Day ${course.days.length + 1}`,
      paragraphs: [{ id: 1, content: "" }],
    };
    
    setCourse({
      ...course,
      days: [...course.days, newDay]
    });
    
    setActiveDay(course.days.length);
    
    toast({
      title: "Day added",
      description: `Day ${course.days.length + 1} has been added to the course.`
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
        id: currentDay.paragraphs.length + 1,
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

  const handleParagraphChange = (paragraphId: number, content: string) => {
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

    onSave(course);
    navigate("/courses");
    
    toast({
      title: "Course saved",
      description: `${course.title} has been saved successfully.`
    });
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
          <Button onClick={handleSaveCourse}>
            <Save className="mr-2 h-4 w-4" />
            Save Course
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
                    Course Name
                  </label>
                  <Input 
                    placeholder="Enter course name" 
                    value={course.title}
                    onChange={handleTitleChange}
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
                      <Button
                        key={day.id}
                        variant={activeDay === idx ? "default" : "outline"}
                        onClick={() => setActiveDay(idx)}
                      >
                        {day.title}
                      </Button>
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

                    {course.days[activeDay].paragraphs.map((paragraph) => (
                      <div key={paragraph.id} className="space-y-2">
                        <label className="text-sm font-medium leading-none">
                          Paragraph ({paragraph.id})
                        </label>
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
