
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useAITutor = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const askAITutor = async (query: string, tutorId?: string, context: any[] = []) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.functions.invoke('ai-tutor', {
        body: JSON.stringify({ 
          query, 
          context,
          persona: tutorId ? await getTutorPersona(tutorId) : 'helpful assistant' 
        })
      });

      if (error) throw error;

      setLoading(false);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
      return null;
    }
  };

  const getTutorPersona = async (tutorId: string) => {
    const { data, error } = await supabase
      .from('ai_tutors')
      .select('persona')
      .eq('id', tutorId)
      .single();

    if (error) throw error;
    return data.persona;
  };

  return {
    askAITutor,
    loading,
    error
  };
};
