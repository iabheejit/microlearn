
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useAITutor = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const askAITutor = async (query: string, courseId?: string, context: any[] = []) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.functions.invoke('ai-tutor', {
        body: { query, courseId: courseId || null, context, persona: 'supportive microlearning tutor' }
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

  return {
    askAITutor,
    loading,
    error
  };
};

