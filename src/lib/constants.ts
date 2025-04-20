
export const APP_NAME = "Ekatra";
export const APP_DESCRIPTION = "Enterprise Learning Platform";

export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  DASHBOARD: "/dashboard",
  USERS: "/users",
  COURSES: "/courses",
  ANALYTICS: "/analytics",
  WHATSAPP: "/whatsapp",
  TELEGRAM: "/telegram",
  CHAT_HISTORY: "/chat-history",
  SETTINGS: "/settings",
};

export const DASHBOARD_SECTIONS = [
  { name: "Overview", path: ROUTES.DASHBOARD, icon: "LayoutDashboard" },
  { name: "Users", path: ROUTES.USERS, icon: "Users" },
  { name: "Courses", path: ROUTES.COURSES, icon: "BookOpen" },
  { name: "Analytics", path: ROUTES.ANALYTICS, icon: "BarChart" },
  { name: "WhatsApp", path: ROUTES.WHATSAPP, icon: "MessageCircle" },
  { name: "Telegram", path: ROUTES.TELEGRAM, icon: "Telegram" },
  { name: "Chat History", path: ROUTES.CHAT_HISTORY, icon: "MessageCircle" },
  { name: "Settings", path: ROUTES.SETTINGS, icon: "Settings" },
];

export const MOCK_STATS = [
  { name: "Total Users", value: "2,543", change: "+12.3%", trend: "up" as "up" },
  { name: "Active Courses", value: "48", change: "+3.2%", trend: "up" as "up" },
  { name: "Completion Rate", value: "76%", change: "-1.8%", trend: "down" as "down" },
  { name: "Messages Sent", value: "12,498", change: "+24.5%", trend: "up" as "up" },
];

export const MOCK_COURSES = [
  {
    id: 1,
    title: "Introduction to Management",
    enrolled: 342,
    completion: 78,
    status: "active" as "active",
    created: "2023-10-15",
  },
  {
    id: 2,
    title: "Digital Marketing Essentials",
    enrolled: 254,
    completion: 65,
    status: "active" as "active",
    created: "2023-11-20",
  },
  {
    id: 3,
    title: "Leadership Skills",
    enrolled: 189,
    completion: 82,
    status: "active" as "active",
    created: "2023-09-05",
  },
  {
    id: 4,
    title: "Data Analysis Fundamentals",
    enrolled: 201,
    completion: 53,
    status: "draft" as "draft",
    created: "2024-01-10",
  },
];

export const MOCK_USERS = [
  {
    id: 1,
    name: "John Doe",
    email: "john.doe@example.com",
    role: "Student",
    courses: 3,
    joined: "2023-08-10",
    status: "active" as "active",
  },
  {
    id: 2,
    name: "Jane Smith",
    email: "jane.smith@example.com",
    role: "Student",
    courses: 4,
    joined: "2023-09-15",
    status: "active" as "active",
  },
  {
    id: 3,
    name: "Michael Johnson",
    email: "michael.johnson@example.com",
    role: "Instructor",
    courses: 2,
    joined: "2023-07-20",
    status: "active" as "active",
  },
  {
    id: 4,
    name: "Emily Brown",
    email: "emily.brown@example.com",
    role: "Student",
    courses: 1,
    joined: "2023-10-05",
    status: "inactive" as "inactive",
  },
];
