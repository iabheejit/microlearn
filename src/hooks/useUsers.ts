
import { useState } from "react";
import { User } from "@/lib/types";
import { useToast } from "@/components/ui/use-toast";
import { UserValidation } from "@/lib/types/user";
import { createUser, deleteUserById, fetchUsersList, updateUserById } from "@/services/userService";

export const useUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const usersList = await fetchUsersList();
      setUsers(usersList);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast({
        title: "Error fetching users",
        description: (error as Error).message,
        variant: "destructive",
      });
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
      console.error("Error adding user:", error);
      toast({
        title: "Error adding user",
        description: (error as Error).message,
        variant: "destructive",
      });
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
      console.error("Error updating user:", error);
      toast({
        title: "Error updating user",
        description: (error as Error).message,
        variant: "destructive",
      });
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
      console.error("Error deleting user:", error);
      toast({
        title: "Error deleting user",
        description: (error as Error).message,
        variant: "destructive",
      });
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
