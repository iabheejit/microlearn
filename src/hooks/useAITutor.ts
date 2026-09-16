
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useAITutor = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const askAITutor = async (query: string, tutorId?: string, context: any[] = []) => {
    setLoading(true);
    setError(null);

    try {
      // Determine the persona to use
      let persona = 'helpful assistant';
      
      if (tutorId) {
        // Find tutor configuration in analytics events.
        const { data: tutorConfig, error: tutorError } = await supabase
          .from('analytics')
          .select('event_data')
          .eq('event_type', 'tutor_created')
          .eq('id', tutorId)
          .single();
        
        if (!tutorError && tutorConfig?.event_data && typeof tutorConfig.event_data === 'object' && !Array.isArray(tutorConfig.event_data)) {
          persona = (tutorConfig.event_data as { persona?: string }).persona || persona;
        }
      }

      const { data, error } = await supabase.functions.invoke('ai-tutor', {
        body: JSON.stringify({ 
          query, 
          context,
          persona
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

  return {
    askAITutor,
    loading,
    error
  };
};

