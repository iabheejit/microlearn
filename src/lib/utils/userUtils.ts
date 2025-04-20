
import { UserRole } from "../types/user";

export const validateRole = (role: string): UserRole | null => {
  const validRoles: UserRole[] = ["admin", "content_creator", "learner"];
  return validRoles.includes(role as UserRole) ? (role as UserRole) : null;
};

export const getUserDisplayId = (uuid: string): number => {
  return parseInt(uuid.substring(0, 8), 16);
};

export const formatUserName = (firstName: string | null, lastName: string | null, email: string | null): string => {
  if (firstName || lastName) {
    return `${firstName || ''} ${lastName || ''}`.trim();
  }
  return email?.split('@')[0] || 'Unknown';
};
