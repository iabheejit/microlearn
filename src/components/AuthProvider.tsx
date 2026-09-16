
import { useEffect, useState, ReactNode, createContext, useContext } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/lib/constants";
import { AuthContextProps } from "@/hooks/useAuthContext";

const DEMO_SESSION_KEY = "ekatra-demo-session";

export const AuthContext = createContext<AuthContextProps>({
  session: null,
  user: null,
  isDemo: false,
  loading: true,
  signInDemo: () => {},
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
  const [isDemo, setIsDemo] = useState(
    () => window.localStorage.getItem(DEMO_SESSION_KEY) === "active"
  );
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // Then check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Cleanup subscription
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    window.localStorage.removeItem(DEMO_SESSION_KEY);
    setIsDemo(false);
    await supabase.auth.signOut();
    navigate(ROUTES.LOGIN);
  };

  const signInDemo = () => {
    window.localStorage.setItem(DEMO_SESSION_KEY, "active");
    setIsDemo(true);
  };

  const value = {
    session,
    user,
    isDemo,
    loading,
    signInDemo,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const RequireAuth = ({ children }: { children: ReactNode }) => {
  const { user, isDemo, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user && !isDemo) {
      navigate(ROUTES.LOGIN);
    }
  }, [user, isDemo, loading, navigate]);

  if (loading) {
    return <div>Loading...</div>;
  }

  return user || isDemo ? <>{children}</> : null;
};
