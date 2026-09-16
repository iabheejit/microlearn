
import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/AuthProvider";
import BrandLogo from "@/components/BrandLogo";
import { DASHBOARD_SECTIONS } from "@/lib/constants";
import { 
  LayoutDashboard, 
  Users, 
  BookOpen, 
  BarChart, 
  MessageCircle, 
  Settings,
  ChevronLeft,
  LogOut,
  MessageSquare,
  Webhook
} from "lucide-react";

const getIcon = (icon: string) => {
  switch (icon) {
    case "LayoutDashboard":
      return <LayoutDashboard size={20} />;
    case "Users":
      return <Users size={20} />;
    case "BookOpen":
      return <BookOpen size={20} />;
    case "BarChart":
      return <BarChart size={20} />;
    case "MessageCircle":
      return <MessageCircle size={20} />;
    case "Settings":
      return <Settings size={20} />;
    case "Telegram":
      return <MessageSquare size={20} />;
    case "Webhook":
      return <Webhook size={20} />;
    default:
      return <LayoutDashboard size={20} />;
  }
};

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const location = useLocation();
  const { signOut } = useAuth();

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setCollapsed(true);
      }
    };
    
    checkMobile();
    window.addEventListener("resize", checkMobile);
    
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return (
    <div
      className={cn(
        "h-screen flex flex-col bg-white dark:bg-gray-950 border-r border-border transition-all duration-300 ease-in-out",
        collapsed ? "w-[70px]" : "w-[240px]"
      )}
    >
      <div className="flex items-center h-16 px-4 border-b border-border">
        <Link to="/" className="flex items-center">
          <BrandLogo compact={collapsed} imageClassName="h-8 w-8" className="text-lg" />
        </Link>
        {!isMobile && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeft
              size={18}
              className={cn(
                "transition-transform duration-300",
                collapsed && "rotate-180"
              )}
            />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-6 px-2">
        <ul className="space-y-2">
          {DASHBOARD_SECTIONS.map((section) => (
            <li key={section.name}>
              <Link
                to={section.path}
                className={cn(
                  "flex items-center px-2 py-2 rounded-md transition-colors",
                  "hover:bg-muted hover:text-foreground group",
                  location.pathname === section.path
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground"
                )}
              >
                <span className="inline-flex items-center justify-center w-8 h-8">
                  {getIcon(section.icon)}
                </span>
                {!collapsed && (
                  <span className="ml-2 text-sm font-medium">{section.name}</span>
                )}
                {collapsed && (
                  <span className="fixed left-[70px] ml-2 px-2 py-1 rounded-md bg-popover text-popover-foreground text-xs opacity-0 group-hover:opacity-100 transition-opacity z-50">
                    {section.name}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-4 border-t border-border">
        <Button
          type="button"
          variant="ghost"
          onClick={() => void signOut()}
          className="w-full justify-start px-0 text-muted-foreground hover:text-foreground"
        >
          <span className="inline-flex items-center justify-center w-8 h-8">
            <LogOut size={20} />
          </span>
          {!collapsed && <span className="ml-2 text-sm">Log out</span>}
        </Button>
      </div>
    </div>
  );
};

export default Sidebar;
