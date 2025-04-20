
import { Database } from "@/integrations/supabase/types";

export type UserRole = Database["public"]["Enums"]["user_role"];

export interface UserValidation {
  name: string;
  email: string;
  role: UserRole;
}

export interface UserUpdatePayload {
  name?: string;
  email?: string;
  role?: UserRole;
  status?: 'active' | 'inactive';
}
