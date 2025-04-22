import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/dashboard/Sidebar";
import CoursesList from "@/components/dashboard/CoursesList";
import { MOCK_COURSES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Course } from "@/lib/types";
import { fetchCourses } from "@/lib/api";
import { crypto } from "crypto";

const Courses = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const { data: courses = [], isLoading, error } = useQuery({
    queryKey: ['courses'],
    queryFn: fetchCourses,
    initialData: MOCK_COURSES,
  });

  const handleCreateNewCourse = () => {
    const newCourse: Course = {
      id: crypto.randomUUID(),
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

    navigate('/courses/editor', { state: { course: newCourse, isNew: true } });
    
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

          {isLoading ? (
            <div className="flex justify-center p-8">
              <p>Loading courses...</p>
            </div>
          ) : error ? (
            <div className="flex justify-center p-8 text-destructive">
              <p>Error loading courses: {(error as Error).message}</p>
            </div>
          ) : (
            <CoursesList courses={courses} />
          )}
        </div>
      </main>
    </div>
  );
};

export default Courses;
