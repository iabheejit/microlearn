import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/AuthProvider";
import { Link } from "@/lib/router-compat";
import { ROUTES } from "@/lib/constants";

// Learner-facing shell: no staff navigation, just the brand, a way home and sign out.
export default function LearnerLayout({ children }: { children: ReactNode }) {
  const { user, isStaff, signOut } = useAuth();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link to={ROUTES.LEARN} aria-label="My courses">
            <BrandLogo />
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {isStaff && (
              <Link
                to={ROUTES.DASHBOARD}
                className="text-muted-foreground hover:text-foreground"
              >
                Staff portal
              </Link>
            )}
            <span className="hidden text-muted-foreground sm:inline">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
