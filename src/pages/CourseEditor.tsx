
import { useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import Sidebar from "@/components/dashboard/Sidebar";
import CourseEditor from "@/components/dashboard/CourseEditor";
import { useToast } from "@/components/ui/use-toast";
import { Course } from "@/lib/types";
import { MOCK_COURSES } from "@/lib/constants";

const CourseEditorPage = () => {
  const { id } = useParams();
  const location = useLocation();
  const { toast } = useToast();
  
  // Check if we have a course from the location state (for new courses)
  const courseFromState = location.state?.course;
  
  // Find the course in mock data if editing an existing course
  const existingCourse = id ? MOCK_COURSES.find(c => c.id === parseInt(id)) : undefined;
  
  const [courses, setCourses] = useState<Course[]>(MOCK_COURSES);

  const handleSaveCourse = (course: Course) => {
    const isNew = !existingCourse;
    
    if (isNew) {
      setCourses([...courses, course]);
    } else {
      setCourses(courses.map(c => c.id === course.id ? course : c));
    }
    
    toast({
      title: isNew ? "Course created" : "Course updated",
      description: `${course.title} has been ${isNew ? 'created' : 'updated'} successfully.`
    });
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto py-6 px-4 md:px-6">
          <header className="mb-6">
            <h1 className="text-2xl font-bold">
              {existingCourse ? "Edit Course" : "Create New Course"}
            </h1>
            <p className="text-muted-foreground">
              {existingCourse 
                ? "Update your existing course details and content." 
                : "Create a new course with detailed daily content."}
            </p>
          </header>

          <CourseEditor 
            initialCourse={existingCourse || courseFromState} 
            onSave={handleSaveCourse}
          />
        </div>
      </main>
    </div>
  );
};

export default CourseEditorPage;
