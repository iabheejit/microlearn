
import { useState } from "react";
import { User } from "@/lib/types";
import { useToast } from "@/components/ui/use-toast";
import { UserValidation } from "@/lib/types/user";
import { createUser, deleteUserById, fetchUsersList, updateUserById } from "@/services/userService";

export const useUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const handleServiceError = (action: string, error: unknown) => {
    console.error(`Error ${action}:`, error);
    toast({
      title: `Error ${action}`,
      description: (error as Error).message,
      variant: "destructive",
    });
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const usersList = await fetchUsersList();
      setUsers(usersList);
    } catch (error) {
      handleServiceError("fetching users", error);
    } finally {
      setLoading(false);
    }
  };

  const addUser = async (newUser: Partial<UserValidation>) => {
    try {
      await createUser(newUser.email!, newUser.role!);
      toast({
        title: "User created",
        description: `${newUser.email} has been created successfully.`,
      });
      fetchUsers();
    } catch (error) {
      handleServiceError("adding user", error);
    }
  };

  const updateUser = async (userId: number, updates: Partial<UserValidation>) => {
    try {
      await updateUserById(userId, updates);
      toast({
        title: "User updated",
        description: "User has been updated successfully.",
      });
      fetchUsers();
    } catch (error) {
      handleServiceError("updating user", error);
    }
  };

  const deleteUser = async (userId: number) => {
    try {
      await deleteUserById(userId);
      toast({
        title: "User deleted",
        description: "User has been deleted successfully.",
      });
      setUsers(users.filter(u => u.id !== userId));
    } catch (error) {
      handleServiceError("deleting user", error);
    }
  };

  return {
    users,
    loading,
    fetchUsers,
    addUser,
    updateUser,
    deleteUser
  };
};
