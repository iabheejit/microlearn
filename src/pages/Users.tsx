
import { useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import UsersList from "@/components/dashboard/UsersList";
import { Loader2 } from "lucide-react";
import { useUsers } from "@/hooks/useUsers";

const Users = () => {
  const { users, loading, fetchUsers, addUser, updateUser, deleteUser } = useUsers();

  useEffect(() => {
    fetchUsers();
  }, []);

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
              onAddUser={addUser}
              onUpdateUser={updateUser}
              onDeleteUser={deleteUser}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default Users;
