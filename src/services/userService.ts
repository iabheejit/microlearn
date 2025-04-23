import { supabase } from "@/integrations/supabase/client";
import { AppUser, UserRole, UserUpdatePayload } from "@/lib/types/user";
import { formatUserName, getUserDisplayId } from "@/lib/utils/userUtils";
import { 
  fetchProfiles, 
  fetchUserRoles,
  findUserByDisplayId,
  updateUserProfile as updateProfile,
} from "./supabaseService";

/**
 * Fetch all visible users with their profiles and roles
 * Note: This won't use admin APIs which require special privileges
 */
export const fetchUsersList = async () => {
  try {
    // Get the current user's ID for reference
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    
    // Check if user has admin role
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();
      
    if (!userRole || userRole.role !== 'admin') {
      const error = new Error("Admin access required to manage users");
      (error as any).code = "not_admin";
      throw error;
    }
    
    // Fetch profiles that are accessible to the current user
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*');
    
    if (profilesError) throw profilesError;
    
    // Fetch user roles that are accessible to the current user
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('*');
      
    if (rolesError) throw rolesError;
    
    // Map the data to AppUser format
    return profiles.map(profile => {
      const userRole = userRoles.find(ur => ur.user_id === profile.id);
      const role = userRole?.role || 'learner';
      
      return {
        id: getUserDisplayId(profile.id),
        name: formatUserName(profile.first_name, profile.last_name, profile.id), // Using ID as fallback
        email: profile.id, // We may not have access to real emails without admin
        role: role,
        courses: 0, // Default value or fetch from another table if accessible
        joined: new Date(profile.created_at).toISOString().split('T')[0],
        status: "active" // Default status as we may not have access to admin metadata
      } as AppUser;
    });
  } catch (error) {
    console.error("Error in fetchUsersList:", error);
    throw error;
  }
};

/**
 * Invite a new user via email
 * This uses a different approach than direct creation which requires admin rights
 */
export const inviteUser = async (email: string, role: UserRole) => {
  try {
    // Check if current user is admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    
    // Check admin role
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();
      
    if (!userRole || userRole.role !== 'admin') {
      const error = new Error("Admin access required to invite users");
      (error as any).code = "not_admin";
      throw error;
    }
    
    // For demonstration only - in a real app, you'd implement a proper invitation flow
    throw new Error("User invitation requires admin access through the Supabase dashboard");
  } catch (error) {
    console.error("Error in inviteUser:", error);
    throw error;
  }
};

/**
 * Update a user's profile
 */
export const updateUserProfile = async (displayId: number, updates: UserUpdatePayload) => {
  try {
    // Since we don't have admin access, we'll limit what can be updated
    // Typically, users can only update their own profiles without admin rights
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    
    // Check admin role for updating other users
    const userDisplayId = getUserDisplayId(user.id);
    if (userDisplayId !== displayId) {
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
        
      if (!userRole || userRole.role !== 'admin') {
        const error = new Error("Admin access required to update other users");
        (error as any).code = "not_admin";
        throw error;
      }
    }
    
    if (updates.name) {
      const nameParts = updates.name.split(' ');
      const first_name = nameParts[0];
      const last_name = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
      
      await updateProfile(user.id, { first_name, last_name });
    }
    
    // Note: Role and status changes typically require admin rights
    if (updates.role || updates.status) {
      throw new Error("Role and status changes require admin privileges through the Supabase dashboard");
    }
  } catch (error) {
    console.error("Error in updateUserProfile:", error);
    throw error;
  }
};

/**
 * Delete a user account (limited functionality without admin rights)
 */
export const deleteUserAccount = async (displayId: number) => {
  try {
    // Check if current user is admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    
    // Check admin role
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();
      
    if (!userRole || userRole.role !== 'admin') {
      const error = new Error("Admin access required to delete users");
      (error as any).code = "not_admin";
      throw error;
    }
    
    // For demonstration only
    throw new Error("User deletion requires admin access through the Supabase dashboard");
  } catch (error) {
    console.error("Error in deleteUserAccount:", error);
    throw error;
  }
};

// Keep other utility functions for backwards compatibility
export { fetchProfiles, fetchUserRoles, findUserByDisplayId };
