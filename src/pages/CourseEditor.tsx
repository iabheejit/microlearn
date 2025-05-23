import { useState, useEffect } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/dashboard/Sidebar";
import CourseEditorComponent from "@/components/dashboard/CourseEditor";
import { useToast } from "@/components/ui/use-toast";
import { Course } from "@/lib/types";
import { fetchCourse, saveCourse } from "@/lib/api";
import { MOCK_COURSES } from "@/lib/constants";

const CourseEditorPage = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Check if we have a course from the location state (for new courses)
  const courseFromState = location.state?.course;
  const isNewCourse = location.state?.isNew || false;
  
  // Fetch course data if editing an existing course
  const { data: existingCourse, isLoading } = useQuery({
    queryKey: ['course', id],
    queryFn: () => fetchCourse(id as string),
    enabled: !!id && !isNewCourse && id !== 'NaN',
    initialData: id && !isNewCourse && id !== 'NaN' 
      ? MOCK_COURSES.find(c => c.id === id) 
      : undefined
  });

  // Mutation for saving course
  const saveMutation = useMutation({
    mutationFn: saveCourse,
    onSuccess: (savedCourse) => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      
      // Make sure we have a valid ID before trying to navigate
      const courseId = savedCourse.id;
      if (courseId) {
        // Invalidate the specific course query
        queryClient.invalidateQueries({ queryKey: ['course', courseId.toString()] });
        
        // Redirect to the course preview with the correct ID format
        navigate(`/courses/preview/${courseId}`);
        
        toast({
          title: isNewCourse ? "Course created" : "Course updated",
          description: `${savedCourse.title} has been ${isNewCourse ? 'created' : 'updated'} successfully.`
        });
      } else {
        toast({
          title: "Warning",
          description: "Course saved but ID is missing. Please check the courses list.",
          variant: "destructive"
        });
        navigate("/courses");
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to save course: ${(error as Error).message}`,
        variant: "destructive"
      });
    }
  });

  const handleSaveCourse = (course: Course) => {
    saveMutation.mutate(course);
  };

  if (isLoading && !courseFromState) {
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

          <CourseEditorComponent 
            initialCourse={existingCourse || courseFromState} 
            onSave={handleSaveCourse}
            isSaving={saveMutation.isPending}
          />
        </div>
      </main>
    </div>
  );
};

export default CourseEditorPage;
