
import { Course } from "../types";
import { checkAuth } from "./utils";
import { fetchCourse } from "./fetchCourse";
import { saveCourse } from "./saveCourse";

// Duplicate a course
export const duplicateCourse = async (id: number | string): Promise<Course> => {
  try {
    // Check if user is authenticated
    await checkAuth();

    // Fetch the course to duplicate
    const course = await fetchCourse(id);
    
    // Create a new course object based on the existing one
    const newCourse: Course = {
      ...course,
      id: crypto.randomUUID(), // Generate a new string ID
      title: `${course.title} (Copy)`,
      enrolled: 0,
      completion: 0,
      status: "draft",
      created: new Date().toISOString().split('T')[0]
    };
    
    // Save the new course
    return await saveCourse(newCourse);
  } catch (error) {
    console.error(`Error duplicating course ${id}:`, error);
    throw new Error(`Failed to duplicate course: ${(error as Error).message}`);
  }
};
