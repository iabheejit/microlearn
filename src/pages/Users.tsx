
import { useEffect, useState } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import UsersList from "@/components/dashboard/UsersList";
import { Loader2 } from "lucide-react";
import { useUsers } from "@/hooks/useUsers";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

const Users = () => {
  const { users, loading, fetchUsers, addUser, updateUser, deleteUser } = useUsers();
  const [adminRequired, setAdminRequired] = useState(false);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        await fetchUsers();
      } catch (error) {
        // Check if error is related to admin permissions
        if ((error as Error).message?.includes("admin") || 
            (error as any)?.code === "not_admin") {
          setAdminRequired(true);
        }
      }
    };
    
    loadUsers();
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

          {adminRequired && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Admin Access Required</AlertTitle>
              <AlertDescription>
                You don't have admin permissions to manage users. Please contact your administrator for assistance.
              </AlertDescription>
            </Alert>
          )}

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
              adminRequired={adminRequired}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default Users;
