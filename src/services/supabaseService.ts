
import { supabase } from "@/integrations/supabase/client";
import { AuthUser } from "@/lib/types/user";

/**
 * Fetches all authenticated users from Supabase
 */
export const fetchAuthUsers = async (): Promise<AuthUser[]> => {
  const { data: authUsers, error } = await supabase.auth.admin.listUsers();
  if (error) throw error;
  if (!authUsers?.users) throw new Error("No users returned from auth system");
  return authUsers.users;
};

/**
 * Find user by display ID
 */
export const findUserByDisplayId = (users: AuthUser[], displayId: number): AuthUser => {
  const user = users.find(u => parseInt(u.id.substring(0, 8), 16) === displayId);
  if (!user) throw new Error("User not found in auth system");
  return user;
};

/**
 * Fetch profiles from Supabase
 */
export const fetchProfiles = async () => {
  const { data: profiles, error } = await supabase.from('profiles').select('*');
  if (error) throw error;
  return profiles || [];
};

/**
 * Fetch user roles from Supabase
 */
export const fetchUserRoles = async () => {
  const { data: userRoles, error } = await supabase.from('user_roles').select('*');
  if (error) throw error;
  return userRoles || [];
};

/**
 * Update user profile
 */
export const updateUserProfile = async (userId: string, updates: { first_name?: string, last_name?: string }) => {
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);
  
  if (error) throw error;
};

/**
 * Update user role
 */
export const updateUserRole = async (userId: string, role: string) => {
  // Check if user already has a role
  const { data: existingRoles } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', userId);

  if (existingRoles && existingRoles.length > 0) {
    const { error } = await supabase
      .from('user_roles')
      .update({ role })
      .eq('user_id', userId);
    
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('user_roles')
      .insert({ user_id: userId, role });
    
    if (error) throw error;
  }
};

/**
 * Update user status
 */
export const updateUserStatus = async (userId: string, isActive: boolean) => {
  const { error } = await supabase.auth.admin.updateUserById(
    userId,
    { ban_duration: isActive ? null : 'none' }
  );
  
  if (error) throw error;
};
