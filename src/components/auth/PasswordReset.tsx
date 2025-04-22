
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const PasswordReset = () => {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login?type=recovery`,
      });

      if (error) throw error;

      toast.success("Check your email for password reset instructions");
    } catch (error) {
      console.error("Reset password error:", error);
      toast.error("Failed to send reset instructions");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      toast.success("Password updated successfully");
      navigate("/login");
    } catch (error) {
      console.error("Update password error:", error);
      toast.error("Failed to update password");
    } finally {
      setIsLoading(false);
    }
  };

  const isRecovery = searchParams.get("type") === "recovery";

  return (
    <div className="w-full max-w-md space-y-4">
      <form onSubmit={isRecovery ? handlePasswordUpdate : handleResetRequest}>
        {isRecovery ? (
          <div className="space-y-4">
            <Input
              type="password"
              placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
            />
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Updating..." : "Update Password"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Sending..." : "Send Reset Instructions"}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
};
