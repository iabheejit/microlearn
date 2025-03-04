
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "@/components/dashboard/Sidebar";
import CoursesList from "@/components/dashboard/CoursesList";
import { MOCK_COURSES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Course } from "@/lib/types";

const Courses = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>(MOCK_COURSES);
  const [open, setOpen] = useState(false);
  const [courseTitle, setCourseTitle] = useState("");
  const [courseDescription, setCourseDescription] = useState("");
  const [courseStatus, setCourseStatus] = useState<"active" | "draft" | "archived">("draft");

  const handleAddCourse = () => {
    if (!courseTitle) {
      toast({
        title: "Error",
        description: "Course title is required",
        variant: "destructive"
      });
      return;
    }

    const newCourse: Course = {
      id: courses.length + 1,
      title: courseTitle,
      description: courseDescription,
      enrolled: 0,
      completion: 0,
      status: courseStatus,
      created: new Date().toISOString().split('T')[0]
    };

    setCourses([...courses, newCourse]);
    setCourseTitle("");
    setCourseDescription("");
    setCourseStatus("draft");
    setOpen(false);

    toast({
      title: "Course created",
      description: `${courseTitle} has been created successfully.`
    });
    
    // Navigate to the course editor
    navigate(`/courses/editor`, { state: { course: newCourse } });
  };

  const handleCreateNewCourse = () => {
    navigate('/courses/editor');
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto py-6 px-4 md:px-6">
          <header className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Course Management</h1>
              <p className="text-muted-foreground">
                Create and manage your learning courses
              </p>
            </div>
            
            <Button className="flex items-center gap-2" onClick={handleCreateNewCourse}>
              <Plus size={16} />
              Add Course
            </Button>
          </header>

          <CoursesList courses={courses} />
        </div>
      </main>
    </div>
  );
};

export default Courses;
