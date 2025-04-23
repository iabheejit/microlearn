
import { supabase } from "@/integrations/supabase/client";

/**
 * Base function to invoke secure admin endpoints
 */
const invokeAdminEndpoint = async (action: string, payload?: any) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    
    if (!token) {
      throw new Error("No active session found");
    }
    
    const { data, error } = await supabase.functions.invoke("admin-user-management", {
      body: {
        action,
        payload,
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (error) {
      console.error(`Error invoking admin action ${action}:`, error);
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error(`Error in admin service (${action}):`, error);
    throw error;
  }
};

/**
 * Check if the current user has admin privileges
 */
export const checkAdminAccess = async (): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();
      
    return userRole?.role === 'admin';
  } catch (error) {
    console.error("Error checking admin access:", error);
    return false;
  }
};

/**
 * Export any additional admin-specific functions here
 */
export const adminService = {
  checkAdminAccess,
  invokeAdminEndpoint,
};
