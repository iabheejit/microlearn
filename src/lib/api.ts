
import { Course, CourseDay, CourseParagraph } from "./types";
import { MOCK_COURSES } from "./constants";
import { supabase } from "@/integrations/supabase/client";

// Helper to convert database course format to application format
const dbCourseToAppCourse = (dbCourse: any, days: any[] = []): Course => {
  const courseDays = days.map(day => ({
    id: day.day_number,
    title: day.title,
    paragraphs: day.paragraphs?.map((para: any) => ({
      id: para.paragraph_number,
      content: para.content
    })) || [],
    media: day.media
  }));

  return {
    id: dbCourse.id,
    title: dbCourse.title,
    instructor: dbCourse.instructor,
    description: dbCourse.description,
    category: dbCourse.category,
    language: dbCourse.language,
    price: dbCourse.price,
    enrolled: dbCourse.enrolled || 0,
    completion: dbCourse.completion || 0,
    status: dbCourse.status || "draft",
    created: new Date(dbCourse.created_at).toISOString().split('T')[0],
    days: courseDays
  };
};

// Helper to prepare course for database insertion
const appCourseToDbFormat = (course: Course) => {
  // Extract course data for the courses table
  const courseData = {
    id: course.id,
    title: course.title || "",
    instructor: course.instructor,
    description: course.description,
    category: course.category,
    language: course.language,
    price: course.price || 0,
    enrolled: course.enrolled || 0,
    completion: course.completion || 0,
    status: course.status || "draft",
    created_by: supabase.auth.getUser().then(({ data }) => data.user?.id) // This will be undefined for unauthenticated users
  };

  return { courseData, days: course.days || [] };
};

// Fetch all courses
export const fetchCourses = async (): Promise<Course[]> => {
  try {
    // If we're not authenticated, return mock courses for development
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log("User not authenticated, returning mock courses");
      return MOCK_COURSES;
    }

    // Query the courses table
    const { data: courses, error } = await supabase
      .from('courses')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // For each course, fetch its days and paragraphs
    const coursesWithDays = await Promise.all(
      courses.map(async (course) => {
        const { data: days, error: daysError } = await supabase
          .from('course_days')
          .select('*')
          .eq('course_id', course.id)
          .order('day_number', { ascending: true });

        if (daysError) throw daysError;

        // For each day, fetch its paragraphs
        const daysWithParagraphs = await Promise.all(
          days.map(async (day) => {
            const { data: paragraphs, error: paragraphsError } = await supabase
              .from('course_paragraphs')
              .select('*')
              .eq('day_id', day.id)
              .order('paragraph_number', { ascending: true });

            if (paragraphsError) throw paragraphsError;

            return { ...day, paragraphs };
          })
        );

        return dbCourseToAppCourse(course, daysWithParagraphs);
      })
    );

    return coursesWithDays;
  } catch (error) {
    console.error('Error fetching courses:', error);
    return MOCK_COURSES; // Fallback to mock data in case of error
  }
};

// Fetch a single course by ID
export const fetchCourse = async (id: number | string): Promise<Course> => {
  try {
    // If we're not authenticated, find in mock courses for development
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log("User not authenticated, returning mock course");
      const mockCourse = MOCK_COURSES.find(c => c.id === Number(id));
      if (!mockCourse) throw new Error(`Course with ID ${id} not found`);
      return mockCourse;
    }

    // Query the course
    const { data: course, error } = await supabase
      .from('courses')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    // Fetch the days for this course
    const { data: days, error: daysError } = await supabase
      .from('course_days')
      .select('*')
      .eq('course_id', course.id)
      .order('day_number', { ascending: true });

    if (daysError) throw daysError;

    // For each day, fetch its paragraphs
    const daysWithParagraphs = await Promise.all(
      days.map(async (day) => {
        const { data: paragraphs, error: paragraphsError } = await supabase
          .from('course_paragraphs')
          .select('*')
          .eq('day_id', day.id)
          .order('paragraph_number', { ascending: true });

        if (paragraphsError) throw paragraphsError;

        return { ...day, paragraphs };
      })
    );

    return dbCourseToAppCourse(course, daysWithParagraphs);
  } catch (error) {
    console.error(`Error fetching course ${id}:`, error);
    
    // Fallback to mock data in case of error
    const mockCourse = MOCK_COURSES.find(c => c.id === Number(id));
    if (!mockCourse) throw new Error(`Course with ID ${id} not found`);
    
    return mockCourse;
  }
};

// Save a course (create or update)
export const saveCourse = async (course: Course): Promise<Course> => {
  try {
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("User not authenticated. Please sign in to save courses.");
    }

    const { courseData, days } = appCourseToDbFormat(course);
    
    // Ensure created_by is set to current user
    courseData.created_by = user.id;

    // Insert or update the course
    const { data: savedCourse, error } = await supabase
      .from('courses')
      .upsert(courseData)
      .select()
      .single();

    if (error) throw error;

    // Process days - we'll delete existing days and recreate them
    // First, delete all existing days for this course
    const { error: deleteError } = await supabase
      .from('course_days')
      .delete()
      .eq('course_id', savedCourse.id);

    if (deleteError) throw deleteError;

    // Create new days
    const daysPromises = days.map(async (day, index) => {
      const { data: savedDay, error: dayError } = await supabase
        .from('course_days')
        .insert({
          course_id: savedCourse.id,
          day_number: index + 1,
          title: day.title,
          media: day.media
        })
        .select()
        .single();

      if (dayError) throw dayError;

      // Create paragraphs for this day
      const paragraphsPromises = day.paragraphs.map(async (para, paraIndex) => {
        const { error: paraError } = await supabase
          .from('course_paragraphs')
          .insert({
            day_id: savedDay.id,
            paragraph_number: paraIndex + 1,
            content: para.content
          });

        if (paraError) throw paraError;
      });

      await Promise.all(paragraphsPromises);
      
      return {
        ...savedDay,
        paragraphs: day.paragraphs.map((para, paraIndex) => ({
          paragraph_number: paraIndex + 1,
          content: para.content
        }))
      };
    });

    const savedDays = await Promise.all(daysPromises);
    
    return dbCourseToAppCourse(savedCourse, savedDays);
  } catch (error) {
    console.error('Error saving course:', error);
    throw new Error(`Failed to save course: ${(error as Error).message}`);
  }
};

// Delete a course
export const deleteCourse = async (id: number | string): Promise<void> => {
  try {
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("User not authenticated. Please sign in to delete courses.");
    }

    // Delete the course (cascade will handle days and paragraphs)
    const { error } = await supabase
      .from('courses')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error(`Error deleting course ${id}:`, error);
    throw new Error(`Failed to delete course: ${(error as Error).message}`);
  }
};

// Archive a course
export const archiveCourse = async (id: number | string): Promise<Course> => {
  try {
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("User not authenticated. Please sign in to archive courses.");
    }

    // Update the course status to archived
    const { data: updatedCourse, error } = await supabase
      .from('courses')
      .update({ status: 'archived' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return fetchCourse(id); // Fetch the complete course with days and paragraphs
  } catch (error) {
    console.error(`Error archiving course ${id}:`, error);
    throw new Error(`Failed to archive course: ${(error as Error).message}`);
  }
};

// Duplicate a course
export const duplicateCourse = async (id: number | string): Promise<Course> => {
  try {
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("User not authenticated. Please sign in to duplicate courses.");
    }

    // Fetch the course to duplicate
    const course = await fetchCourse(id);
    
    // Create a new course object based on the existing one
    const newCourse: Course = {
      ...course,
      id: crypto.randomUUID(), // Generate a new UUID
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
