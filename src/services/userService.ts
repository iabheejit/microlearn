
import { supabase } from "@/integrations/supabase/client";
import { User } from "@/lib/types";
import { UserRole, UserUpdatePayload } from "@/lib/types/user";
import { formatUserName, getUserDisplayId, validateRole } from "@/lib/utils/userUtils";

export const fetchUsersList = async () => {
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) throw authError;
  if (!authUsers?.users) throw new Error("No users returned from auth system");

  const { data: profiles, error: profilesError } = await supabase.from('profiles').select('*');
  if (profilesError) throw profilesError;

  const { data: userRoles, error: rolesError } = await supabase.from('user_roles').select('*');
  if (rolesError) throw rolesError;

  return authUsers.users.map(authUser => {
    const profile = profiles?.find(p => p.id === authUser.id);
    const userRole = userRoles?.find(ur => ur.user_id === authUser.id);
    const role = userRole?.role || 'learner';

    return {
      id: getUserDisplayId(authUser.id),
      name: formatUserName(profile?.first_name, profile?.last_name, authUser.email),
      email: authUser.email || '',
      role: role,
      courses: 0,
      joined: new Date(authUser.created_at).toISOString().split('T')[0],
      status: authUser.banned_at ? "inactive" : "active"
    } as User;
  });
};

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
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: data.user.id,
          role: validRole
        });
      
      if (roleError) throw roleError;
    }
  }

  return data.user;
};

export const updateUserById = async (displayId: number, updates: UserUpdatePayload) => {
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  if (!authUsers?.users) throw new Error("Failed to fetch auth users");
  
  // Find the auth user that matches our display ID
  const authUser = authUsers.users.find(u => getUserDisplayId(u.id) === displayId);
  if (!authUser) throw new Error("User not found in auth system");

  if (updates.status !== undefined) {
    const { error: statusError } = await supabase.auth.admin.updateUserById(
      authUser.id,
      { ban_duration: updates.status === 'inactive' ? 'none' : null }
    );
    if (statusError) throw statusError;
  }

  if (updates.name) {
    const nameParts = updates.name.split(' ');
    const first_name = nameParts[0];
    const last_name = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
    
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ first_name, last_name })
      .eq('id', authUser.id);
    
    if (profileError) throw profileError;
  }

  if (updates.role) {
    const validRole = validateRole(updates.role);
    if (validRole) {
      const { data: existingRoles } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', authUser.id);

      if (existingRoles && existingRoles.length > 0) {
        const { error: roleError } = await supabase
          .from('user_roles')
          .update({ role: validRole })
          .eq('user_id', authUser.id);
        
        if (roleError) throw roleError;
      } else {
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert({ user_id: authUser.id, role: validRole });
        
        if (roleError) throw roleError;
      }
    }
  }
};

export const deleteUserById = async (displayId: number) => {
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  if (!authUsers?.users) throw new Error("Failed to fetch auth users");
  
  const authUser = authUsers.users.find(u => getUserDisplayId(u.id) === displayId);
  if (!authUser) throw new Error("User not found in auth system");

  const { error } = await supabase.auth.admin.deleteUser(authUser.id);
  if (error) throw error;
};
