
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "@/components/dashboard/Sidebar";
import CoursesList from "@/components/dashboard/CoursesList";
import { MOCK_COURSES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Course } from "@/lib/types";

const Courses = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>(MOCK_COURSES);

  const handleCreateNewCourse = () => {
    // Create a minimal course object to pass to the editor
    const newCourse: Course = {
      id: Date.now(),
      title: "",
      enrolled: 0,
      completion: 0,
      status: "draft",
      created: new Date().toISOString().split('T')[0],
      days: [{
        id: 1,
        title: "Day 1",
        paragraphs: [{ id: 1, content: "" }]
      }]
    };

    navigate('/courses/editor', { state: { course: newCourse } });
    
    toast({
      title: "New course",
      description: "Start creating your new course"
    });
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
