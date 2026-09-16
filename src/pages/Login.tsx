import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PasswordReset } from "@/components/auth/PasswordReset";
import { useAuth } from "@/components/AuthProvider";
import BrandLogo from "@/components/BrandLogo";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signInDemo } = useAuth();

  // Demo credentials for testing without DB
  const DEMO_EMAIL = "demo@example.com";
  const DEMO_PASSWORD = "demo123";

  const handleAuthentication = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    
    setIsLoading(true);

    // Demo credentials use a real account so all protected portal features work.
    if (email === DEMO_EMAIL && password === DEMO_PASSWORD) {
      try {
        await signInDemo();
        toast.success("Demo login successful");
        navigate(ROUTES.DASHBOARD);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Demo login failed");
      } finally {
        setIsLoading(false);
      }
      return;
    }
    
    try {
      let result;
      
      if (isSignUp) {
        result = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: "",
              last_name: "",
              email_verified: true
            }
          }
        });
      } else {
        result = await supabase.auth.signInWithPassword({
          email,
          password,
        });
      }
      
      if (result.error) {
        throw result.error;
      }
      
      toast.success(isSignUp ? "Account created successfully" : "Login successful");
      navigate(ROUTES.DASHBOARD);
    } catch (error) {
      console.error("Authentication error:", error);
      toast.error(isSignUp 
        ? "Failed to create account. Please try again." 
        : "Login failed. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  const isRecovery = searchParams.get("type") === "recovery";

  if (isRecovery || showReset) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link to={ROUTES.HOME} className="inline-block">
              <BrandLogo className="text-2xl" imageClassName="h-14 w-14" />
            </Link>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Reset Password</CardTitle>
              <CardDescription>
                {isRecovery ? "Enter your new password" : "Enter your email to reset your password"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PasswordReset />
            </CardContent>
            <CardFooter className="flex justify-center">
              {!isRecovery && (
                <Button variant="link" onClick={() => setShowReset(false)}>
                  Back to Login
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to={ROUTES.HOME} className="inline-block">
            <BrandLogo className="text-2xl" imageClassName="h-14 w-14" />
          </Link>
          <p className="mt-2 text-muted-foreground">
            Enterprise Learning Platform
          </p>
        </div>

        <Card className="animate-fade-in">
          <CardHeader>
            <CardTitle>{isSignUp ? "Create Account" : "Login"}</CardTitle>
            <CardDescription>
              {isSignUp 
               ? "Register to start creating and managing courses" 
               : "Enter your credentials to access your account"}
            </CardDescription>
            <div className="mt-3 p-3 bg-muted rounded-md text-sm">
              <p className="font-medium text-foreground">Demo Credentials:</p>
              <p className="text-muted-foreground">Email: demo@example.com</p>
              <p className="text-muted-foreground">Password: demo123</p>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuthentication} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Button
                    variant="link"
                    className="px-0"
                    type="button"
                    onClick={() => setShowReset(true)}
                  >
                    Forgot password?
                  </Button>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading 
                 ? (isSignUp ? "Creating Account..." : "Logging in...") 
                 : (isSignUp ? "Create Account" : "Login")}
              </Button>
              
            </form>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              {isSignUp 
               ? "Already have an account?" 
               : "Don't have an account?"}{" "}
              <Button
                variant="link"
                className="p-0 h-auto"
                onClick={() => setIsSignUp(!isSignUp)}
              >
                {isSignUp ? "Login" : "Sign up"}
              </Button>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default Login;
