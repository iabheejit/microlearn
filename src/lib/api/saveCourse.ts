
import { Course } from "../types";
import { supabase } from "@/integrations/supabase/client";
import { dbCourseToAppCourse, appCourseToDbFormat, checkAuth } from "./utils";

const embedResource = async (resourceId: string, content: string) => {
  if (!content.trim()) return;
  const { data, error } = await supabase.functions.invoke('generate-embedding', { body: { text: content } });
  if (error) throw error;
  const embedding = `[${data.embedding.join(',')}]`;
  const { error: embeddingError } = await supabase.from('resource_embeddings').upsert({ resource_id: resourceId, embedding }, { onConflict: 'resource_id' });
  if (embeddingError) throw embeddingError;
};

// Save a course (create or update)
export const saveCourse = async (course: Course): Promise<Course> => {
  try {
    // Check if user is authenticated
    const user = await checkAuth();

    const { courseData, days } = appCourseToDbFormat(course);
    
    // Add created_by field to courseData if it's a new course
    const dataWithCreatedBy = {
      ...courseData,
      created_by: user.id
    };

    console.log("Saving course with data:", dataWithCreatedBy);

    // Insert or update the course
    const { data: savedCourse, error } = await supabase
      .from('courses')
      .upsert(dataWithCreatedBy)
      .select()
      .single();

    if (error) {
      console.error("Error upserting course:", error);
      throw error;
    }

    const { data: existingModules, error: existingModulesError } = await supabase.from('course_modules').select('id').eq('course_id', savedCourse.id);
    if (existingModulesError) throw existingModulesError;
    const requestedModuleIds = new Set(days.map((day) => day.id));
    const removedModuleIds = existingModules.filter((module) => !requestedModuleIds.has(module.id)).map((module) => module.id);
    if (removedModuleIds.length > 0) {
      const { error: removeModulesError } = await supabase.from('course_modules').delete().in('id', removedModuleIds);
      if (removeModulesError) throw removeModulesError;
    }

    const daysPromises = days.map(async (day, index) => {
      const { data: savedDay, error: dayError } = await supabase
        .from('course_modules')
        .upsert({
          id: day.id,
          course_id: savedCourse.id,
          order_index: index + 1,
          title: day.title,
          description: day.media || null
        }, { onConflict: 'id' })
        .select()
        .single();

      if (dayError) {
        console.error("Error inserting course day:", dayError);
        throw dayError;
      }

      const { data: existingResources, error: existingResourcesError } = await supabase.from('course_resources').select('id').eq('module_id', savedDay.id);
      if (existingResourcesError) throw existingResourcesError;
      const requestedResourceIds = new Set(day.paragraphs.map((paragraph) => paragraph.id));
      const removedResourceIds = existingResources.filter((resource) => !requestedResourceIds.has(resource.id)).map((resource) => resource.id);
      if (removedResourceIds.length > 0) {
        const { error: removeResourcesError } = await supabase.from('course_resources').delete().in('id', removedResourceIds);
        if (removeResourcesError) throw removeResourcesError;
      }

      const paragraphsPromises = day.paragraphs.map(async (para, paraIndex) => {
        const { data: savedResource, error: paraError } = await supabase
          .from('course_resources')
          .upsert({
            id: para.id,
            module_id: savedDay.id,
            order_index: paraIndex + 1,
            title: `Section ${paraIndex + 1}`,
            resource_type: 'text',
            content: para.content,
          }, { onConflict: 'id' })
          .select('id')
          .single();

        if (paraError) {
          console.error("Error inserting paragraph:", paraError);
          throw paraError;
        }
        await embedResource(savedResource.id, para.content);
      });

      await Promise.all(paragraphsPromises);
      
      return {
        ...savedDay,
        paragraphs: day.paragraphs.map((para, paraIndex) => ({
          id: para.id,
          order_index: paraIndex + 1,
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
