
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
 * Note: This now uses the secure admin edge function
 */
export const fetchUsersList = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Get the JWT token for authentication with the edge function
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    
    if (!token) {
      throw new Error("No active session found");
    }
    
    // Call the secure edge function for user management
    const { data, error } = await supabase.functions.invoke("admin-user-management", {
      body: {
        action: "fetchUsers",
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (error) {
      console.error("Error invoking admin-user-management:", error);
      throw error;
    }
    
    return data as AppUser[];
  } catch (error) {
    console.error("Error in fetchUsersList:", error);
    throw error;
  }
};

/**
 * Invite a new user via email
 * Now uses the secure admin edge function
 */
export const inviteUser = async (email: string, role: UserRole) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    
    // Get the JWT token for authentication with the edge function
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    
    if (!token) {
      throw new Error("No active session found");
    }
    
    // Call the secure edge function for user management
    const { data, error } = await supabase.functions.invoke("admin-user-management", {
      body: {
        action: "inviteUser",
        payload: {
          email,
          role,
        },
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (error) {
      console.error("Error invoking admin-user-management:", error);
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error("Error in inviteUser:", error);
    throw error;
  }
};

/**
 * Update a user's profile
 * Now uses the secure admin edge function for admin operations
 */
export const updateUserProfile = async (displayId: number, updates: UserUpdatePayload) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    
    // Check if current user is the same as the one being updated
    const userDisplayId = getUserDisplayId(user.id);
    
    // For self-updates, use the standard method without admin privileges
    if (userDisplayId === displayId && !updates.role && !updates.status) {
      if (updates.name) {
        const nameParts = updates.name.split(' ');
        const first_name = nameParts[0];
        const last_name = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
        
        await updateProfile(user.id, { first_name, last_name });
      }
      return;
    }
    
    // For admin operations (updating others, changing roles or status), use the secure endpoint
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    
    if (!token) {
      throw new Error("No active session found");
    }
    
    const { data, error } = await supabase.functions.invoke("admin-user-management", {
      body: {
        action: "updateUser",
        payload: {
          userId: displayId,
          updates,
        },
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (error) {
      console.error("Error invoking admin-user-management:", error);
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error("Error in updateUserProfile:", error);
    throw error;
  }
};

/**
 * Delete a user account
 * Now uses the secure admin edge function
 */
export const deleteUserAccount = async (displayId: number) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    
    // Get the JWT token for authentication with the edge function
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    
    if (!token) {
      throw new Error("No active session found");
    }
    
    const { data, error } = await supabase.functions.invoke("admin-user-management", {
      body: {
        action: "deleteUser",
        payload: {
          userId: displayId,
        },
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (error) {
      console.error("Error invoking admin-user-management:", error);
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error("Error in deleteUserAccount:", error);
    throw error;
  }
};

// Keep other utility functions for backwards compatibility
export { fetchProfiles, fetchUserRoles, findUserByDisplayId };
