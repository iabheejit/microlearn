
import { useEffect, useState, ReactNode, createContext, useContext } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@/lib/router-compat";
import { ROUTES } from "@/lib/constants";
import { AuthContextProps } from "@/hooks/useAuthContext";

export const AuthContext = createContext<AuthContextProps>({
  session: null,
  user: null,
  isDemo: false,
  loading: true,
  isStaff: false,
  signInDemo: async () => {},
  signOut: async () => {},
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [role, setRole] = useState<{ userId: string; isStaff: boolean } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setIsDemo(session?.user?.email === "demo@example.com");
        setSessionLoading(false);
      }
    );

    // Then check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsDemo(session?.user?.email === "demo@example.com");
      setSessionLoading(false);
    });

    // Cleanup subscription
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Users can read their own role row; only active admins and content creators are staff.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase.from("user_roles").select("role,status").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (cancelled) return;
      setRole({ userId: user.id, isStaff: data?.status === "active" && ["admin", "content_creator"].includes(data.role) });
    });
    return () => { cancelled = true; };
  }, [user]);

  const loading = sessionLoading || Boolean(user && role?.userId !== user.id);
  const isStaff = Boolean(user && role?.userId === user.id && role.isStaff);

  const signOut = async () => {
    setIsDemo(false);
    await supabase.auth.signOut();
    navigate(ROUTES.LOGIN);
  };

  const signInDemo = async () => {
    throw new Error('Demo access is disabled. Sign in with your personal account.');
  };

  const value = {
    session,
    user,
    isDemo,
    loading,
    isStaff,
    signInDemo,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Staff pages are the default audience; learners are sent to their own area.
// This only shapes navigation: data access is still enforced by RLS and server functions.
export const RequireAuth = ({ children, audience = "staff" }: { children: ReactNode; audience?: "staff" | "learner" }) => {
  const { user, loading, isStaff } = useAuth();
  const navigate = useNavigate();
  const allowed = Boolean(user) && (audience === "learner" || isStaff);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate(ROUTES.LOGIN);
    else if (!allowed) navigate(ROUTES.LEARN);
  }, [user, loading, allowed, navigate]);

  if (loading) {
    return <div>Loading...</div>;
  }

  return allowed ? <>{children}</> : null;
};
