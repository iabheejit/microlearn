
import { Database } from "@/integrations/supabase/types";
import { User as SupabaseUser } from "@supabase/supabase-js";

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

export interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

export interface UserRoleRecord {
  user_id: string;
  role: UserRole;
}

export type AuthUser = SupabaseUser;
