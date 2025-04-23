
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
    
    console.log(`Invoking admin action: ${action}`);
    
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
    
    console.log('Checking admin access for user:', user.id);
    
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();
      
    console.log('User role:', userRole);
    return userRole?.role === 'admin';
  } catch (error) {
    console.error("Error checking admin access:", error);
    return false;
  }
};

/**
 * Make the current user an admin (for testing purposes)
 * This would normally require a secure mechanism, but for development we'll allow it
 */
export const makeUserAdmin = async (): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    
    // First check if there's already a role
    const { data: existingRole } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (existingRole) {
      // Update the role
      const { error } = await supabase
        .from('user_roles')
        .update({ role: 'admin' })
        .eq('user_id', user.id);
        
      return !error;
    } else {
      // Insert new role
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: user.id, role: 'admin' });
        
      return !error;
    }
  } catch (error) {
    console.error("Error setting admin access:", error);
    return false;
  }
};

/**
 * Export the admin service functions
 */
export const adminService = {
  checkAdminAccess,
  makeUserAdmin,
  invokeAdminEndpoint,
};
