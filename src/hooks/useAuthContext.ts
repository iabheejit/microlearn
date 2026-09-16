
import { createContext, useContext } from "react";
import { Session, User } from "@supabase/supabase-js";

export interface AuthContextProps {
  session: Session | null;
  user: User | null;
  isDemo: boolean;
  loading: boolean;
  signInDemo: () => void;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextProps>({
  session: null,
  user: null,
  isDemo: false,
  loading: true,
  signInDemo: () => {},
  signOut: async () => {},
});

export const useAuthContext = () => useContext(AuthContext);
