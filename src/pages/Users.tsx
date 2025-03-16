
import { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import UsersList from "@/components/dashboard/UsersList";
import { User } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";
import { Database } from "@/integrations/supabase/types";

// Define the allowed role types to match the enum in the database
type UserRole = Database["public"]["Enums"]["user_role"];

const Users = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Get users from auth
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
      
      if (authError) throw authError;

      // Get profiles to get additional data
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*');
      
      if (profilesError) throw profilesError;

      // Get user roles to determine role
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');
      
      if (rolesError) throw rolesError;

      // Combine the data
      const combinedUsers = authUsers.users.map(authUser => {
        const profile = profiles?.find(p => p.id === authUser.id);
        const userRole = userRoles?.find(ur => ur.user_id === authUser.id);
        // Ensure role is one of the allowed enum types
        const role = userRole?.role || 'learner';

        return {
          id: Number(authUser.id.substring(0, 8), 16), // Convert part of UUID to number
          name: `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || authUser.email?.split('@')[0] || 'Unknown',
          email: authUser.email || '',
          role: role,
          courses: 0, // Would need another query to get actual courses
          joined: new Date(authUser.created_at).toISOString().split('T')[0],
          status: authUser.banned ? "inactive" : "active"
        } as User;
      });

      setUsers(combinedUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast({
        title: "Error fetching users",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (newUser: Partial<User>) => {
    try {
      // Create the user in Supabase Auth
      const { data, error } = await supabase.auth.admin.createUser({
        email: newUser.email,
        password: 'tempPassword123', // This should be generated or provided by the admin
        email_confirm: true,
      });

      if (error) throw error;

      // The profile will be automatically created by the trigger

      // Add user role if needed - ensure role is valid type
      if (newUser.role && newUser.role !== 'learner') {
        // Type assertion or validation to ensure role is of correct type
        const validRole = validateRole(newUser.role);
        
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

      toast({
        title: "User created",
        description: `${newUser.email} has been created successfully.`,
      });

      // Refresh the user list
      fetchUsers();
    } catch (error) {
      console.error("Error adding user:", error);
      toast({
        title: "Error adding user",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleUpdateUser = async (userId: number, updates: Partial<User>) => {
    try {
      // Find the original user to get the real UUID
      const originalUser = users.find(u => u.id === userId);
      if (!originalUser) throw new Error("User not found");

      // Convert display id back to original format
      const { data: authUsers } = await supabase.auth.admin.listUsers();
      if (!authUsers) throw new Error("Failed to fetch auth users");
      
      const authUser = authUsers.users.find(u => Number(u.id.substring(0, 8), 16) === userId);
      
      if (!authUser) throw new Error("User not found in auth system");

      // Update user status if needed
      if (updates.status !== undefined) {
        // Use the correct parameter format for updateUserById
        const { error: statusError } = await supabase.auth.admin.updateUserById(
          authUser.id,
          { user_metadata: { banned: updates.status === 'inactive' } }
        );
        
        if (statusError) throw statusError;
      }

      // Update profile if needed
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

      // Update role if needed
      if (updates.role) {
        // Validate that role is a valid enum value
        const validRole = validateRole(updates.role);
        
        if (validRole) {
          // First check if user has a role
          const { data: existingRoles } = await supabase
            .from('user_roles')
            .select('*')
            .eq('user_id', authUser.id);
          
          if (existingRoles && existingRoles.length > 0) {
            // Update existing role
            const { error: roleError } = await supabase
              .from('user_roles')
              .update({ role: validRole })
              .eq('user_id', authUser.id);
            
            if (roleError) throw roleError;
          } else {
            // Insert new role
            const { error: roleError } = await supabase
              .from('user_roles')
              .insert({ user_id: authUser.id, role: validRole });
            
            if (roleError) throw roleError;
          }
        }
      }

      toast({
        title: "User updated",
        description: `${originalUser.email} has been updated successfully.`,
      });

      // Refresh the user list
      fetchUsers();
    } catch (error) {
      console.error("Error updating user:", error);
      toast({
        title: "Error updating user",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteUser = async (userId: number) => {
    try {
      // Find the original user to get the real UUID
      const originalUser = users.find(u => u.id === userId);
      if (!originalUser) throw new Error("User not found");

      // Convert display id back to original format
      const { data: authUsers } = await supabase.auth.admin.listUsers();
      if (!authUsers) throw new Error("Failed to fetch auth users");
      
      const authUser = authUsers.users.find(u => Number(u.id.substring(0, 8), 16) === userId);
      
      if (!authUser) throw new Error("User not found in auth system");

      // Delete the user
      const { error } = await supabase.auth.admin.deleteUser(
        authUser.id
      );
      
      if (error) throw error;

      toast({
        title: "User deleted",
        description: `${originalUser.email} has been deleted successfully.`,
      });

      // Update local state
      setUsers(users.filter(u => u.id !== userId));
    } catch (error) {
      console.error("Error deleting user:", error);
      toast({
        title: "Error deleting user",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Validate that role is one of the allowed enum values
  const validateRole = (role: string): UserRole | null => {
    const validRoles: UserRole[] = ["admin", "content_creator", "learner"];
    return validRoles.includes(role as UserRole) ? (role as UserRole) : null;
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto py-6 px-4 md:px-6">
          <header className="mb-6">
            <h1 className="text-2xl font-bold">User Management</h1>
            <p className="text-muted-foreground">
              Manage your platform users and learners
            </p>
          </header>

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <UsersList 
              users={users} 
              onAddUser={handleAddUser}
              onUpdateUser={handleUpdateUser}
              onDeleteUser={handleDeleteUser}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default Users;
