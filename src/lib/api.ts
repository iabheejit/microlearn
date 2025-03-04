
import { Course } from "./types";
import { MOCK_COURSES } from "./constants";

// This would eventually be replaced with actual API calls to your backend
// For now, we'll simulate persistence with localStorage

// Helper to initialize localStorage if needed
const initializeLocalStorage = () => {
  if (!localStorage.getItem('courses')) {
    localStorage.setItem('courses', JSON.stringify(MOCK_COURSES));
  }
};

// Fetch all courses
export const fetchCourses = async (): Promise<Course[]> => {
  initializeLocalStorage();
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  try {
    const courses = localStorage.getItem('courses');
    return courses ? JSON.parse(courses) : [];
  } catch (error) {
    console.error('Error fetching courses:', error);
    throw new Error('Failed to load courses');
  }
};

// Fetch a single course by ID
export const fetchCourse = async (id: number): Promise<Course> => {
  initializeLocalStorage();
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 300));
  
  try {
    const courses = localStorage.getItem('courses');
    const parsedCourses: Course[] = courses ? JSON.parse(courses) : [];
    const course = parsedCourses.find(c => c.id === id);
    
    if (!course) {
      throw new Error(`Course with ID ${id} not found`);
    }
    
    return course;
  } catch (error) {
    console.error(`Error fetching course ${id}:`, error);
    throw error;
  }
};

// Save a course (create or update)
export const saveCourse = async (course: Course): Promise<Course> => {
  initializeLocalStorage();
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  try {
    const courses = localStorage.getItem('courses');
    const parsedCourses: Course[] = courses ? JSON.parse(courses) : [];
    
    // Check if course already exists
    const existingIndex = parsedCourses.findIndex(c => c.id === course.id);
    
    if (existingIndex >= 0) {
      // Update existing course
      parsedCourses[existingIndex] = course;
    } else {
      // Add new course
      parsedCourses.push(course);
    }
    
    localStorage.setItem('courses', JSON.stringify(parsedCourses));
    return course;
  } catch (error) {
    console.error('Error saving course:', error);
    throw new Error('Failed to save course');
  }
};

// Delete a course
export const deleteCourse = async (id: number): Promise<void> => {
  initializeLocalStorage();
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  try {
    const courses = localStorage.getItem('courses');
    const parsedCourses: Course[] = courses ? JSON.parse(courses) : [];
    
    const updatedCourses = parsedCourses.filter(c => c.id !== id);
    localStorage.setItem('courses', JSON.stringify(updatedCourses));
  } catch (error) {
    console.error(`Error deleting course ${id}:`, error);
    throw new Error('Failed to delete course');
  }
};

// Archive a course
export const archiveCourse = async (id: number): Promise<Course> => {
  initializeLocalStorage();
  
  try {
    const course = await fetchCourse(id);
    const updatedCourse = { ...course, status: "archived" as "archived" };
    return await saveCourse(updatedCourse);
  } catch (error) {
    console.error(`Error archiving course ${id}:`, error);
    throw new Error('Failed to archive course');
  }
};

// Duplicate a course
export const duplicateCourse = async (id: number): Promise<Course> => {
  initializeLocalStorage();
  
  try {
    const course = await fetchCourse(id);
    
    // Create a new course object based on the existing one
    const newCourse: Course = {
      ...course,
      id: Date.now(),
      title: `${course.title} (Copy)`,
      enrolled: 0,
      completion: 0,
      status: "draft",
      created: new Date().toISOString().split('T')[0]
    };
    
    return await saveCourse(newCourse);
  } catch (error) {
    console.error(`Error duplicating course ${id}:`, error);
    throw new Error('Failed to duplicate course');
  }
};
