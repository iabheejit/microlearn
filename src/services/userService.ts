import { supabase } from "@/integrations/supabase/client";
import { AppUser, UserRole, UserUpdatePayload } from "@/lib/types/user";
import { formatUserName, getUserDisplayId, validateRole } from "@/lib/utils/userUtils";
import { 
  fetchProfiles, 
  fetchUserRoles,
  findUserByDisplayId,
  updateUserProfile as updateProfile,
  updateUserRole,
  updateUserStatus
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
  // For demonstration only - in a real app, you'd implement a proper invitation flow
  // that might involve sending emails or creating placeholder accounts
  
  throw new Error("User invitation requires admin access. Please contact your administrator to add new users.");
  
  // Alternative non-admin approaches could include:
  // 1. Using Magic Link authentication if enabled in Supabase
  // 2. Creating a custom invitation system with email notifications
  // 3. Setting up a signup page with special invite codes
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
    
    // Check if user is updating their own profile or has permission somehow
    const userDisplayId = getUserDisplayId(user.id);
    if (userDisplayId !== displayId) {
      throw new Error("You can only update your own profile without admin rights");
    }
    
    if (updates.name) {
      const nameParts = updates.name.split(' ');
      const first_name = nameParts[0];
      const last_name = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
      
      await updateProfile(user.id, { first_name, last_name });
    }
    
    // Note: Role and status changes typically require admin rights
    // This is just a placeholder to maintain interface compatibility
    if (updates.role || updates.status) {
      console.warn("Role and status changes require admin privileges");
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
    // For regular users, they can typically only delete their own account
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    
    const userDisplayId = getUserDisplayId(user.id);
    if (userDisplayId !== displayId) {
      throw new Error("You can only delete your own account without admin rights");
    }
    
    // User deleting their own account
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    
    // Note: Complete account deletion typically requires admin access
    // This only signs the user out; actual deletion would need admin intervention
    throw new Error("Complete account deletion requires admin access. Please contact your administrator.");
  } catch (error) {
    console.error("Error in deleteUserAccount:", error);
    throw error;
  }
};

// Keep other utility functions for backwards compatibility
export { fetchProfiles, fetchUserRoles, findUserByDisplayId };
