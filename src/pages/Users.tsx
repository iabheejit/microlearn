
import { useEffect, useState } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import UsersList from "@/components/dashboard/UsersList";
import { Loader2 } from "lucide-react";
import { useUsers } from "@/hooks/useUsers";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { adminService } from "@/services/adminService";
import { Button } from "@/components/ui/button";

const Users = () => {
  const { users, loading, adminRequired, fetchUsers, addUser, updateUser, deleteUser } = useUsers();
  const [isSettingAdmin, setIsSettingAdmin] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleMakeAdmin = async () => {
    setIsSettingAdmin(true);
    try {
      const success = await adminService.makeUserAdmin();
      if (success) {
        window.location.reload(); // Refresh to apply changes
      }
    } catch (error) {
      console.error("Failed to set admin role:", error);
    } finally {
      setIsSettingAdmin(false);
    }
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

          {adminRequired && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Admin Access Required</AlertTitle>
              <AlertDescription className="flex flex-col gap-4">
                <p>You don't have admin permissions to manage users.</p>
                <Button 
                  variant="outline" 
                  onClick={handleMakeAdmin} 
                  disabled={isSettingAdmin}
                  className="self-start"
                >
                  {isSettingAdmin && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Make me an Admin (Development Only)
                </Button>
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
