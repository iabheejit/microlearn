
import { supabase } from "@/integrations/supabase/client";
import { AppUser, UserRole, UserUpdatePayload } from "@/lib/types/user";
import { formatUserName, getUserDisplayId, validateRole } from "@/lib/utils/userUtils";
import { 
  fetchAuthUsers, 
  fetchProfiles, 
  fetchUserRoles, 
  findUserByDisplayId,
  updateUserProfile,
  updateUserRole,
  updateUserStatus
} from "./supabaseService";

/**
 * Fetch all users with their profiles and roles
 */
export const fetchUsersList = async () => {
  const authUsers = await fetchAuthUsers();
  const profiles = await fetchProfiles();
  const userRoles = await fetchUserRoles();

  return authUsers.map(authUser => {
    const profile = profiles.find(p => p.id === authUser.id);
    const userRole = userRoles.find(ur => ur.user_id === authUser.id);
    const role = userRole?.role || 'learner';

    return {
      id: getUserDisplayId(authUser.id),
      name: formatUserName(profile?.first_name, profile?.last_name, authUser.email),
      email: authUser.email || '',
      role: role,
      courses: 0,
      joined: new Date(authUser.created_at).toISOString().split('T')[0],
      status: authUser.banned_until ? "inactive" : "active"
    } as AppUser;
  });
};

/**
 * Create a new user
 */
export const createUser = async (email: string, role: UserRole) => {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: 'tempPassword123',
    email_confirm: true,
  });

  if (error) throw error;
  if (!data?.user) throw new Error("Failed to create user");

  if (role && role !== 'learner') {
    const validRole = validateRole(role);
    if (validRole) {
      await updateUserRole(data.user.id, validRole);
    }
  }

  return data.user;
};

/**
 * Update a user by ID
 */
export const updateUserById = async (displayId: number, updates: UserUpdatePayload) => {
  const authUsers = await fetchAuthUsers();
  const authUser = findUserByDisplayId(authUsers, displayId);

  if (updates.status !== undefined) {
    await updateUserStatus(authUser.id, updates.status === 'active');
  }

  if (updates.name) {
    const nameParts = updates.name.split(' ');
    const first_name = nameParts[0];
    const last_name = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
    
    await updateUserProfile(authUser.id, { first_name, last_name });
  }

  if (updates.role) {
    const validRole = validateRole(updates.role);
    if (validRole) {
      await updateUserRole(authUser.id, validRole);
    }
  }
};

/**
 * Delete a user by ID
 */
export const deleteUserById = async (displayId: number) => {
  const authUsers = await fetchAuthUsers();
  const authUser = findUserByDisplayId(authUsers, displayId);

  const { error } = await supabase.auth.admin.deleteUser(authUser.id);
  if (error) throw error;
};
