
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Courses from "./pages/Courses";
import CourseEditor from "./pages/CourseEditor";
import CoursePreview from "./pages/CoursePreview";
import Users from "./pages/Users";
import WhatsApp from "./pages/WhatsApp";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import { ROUTES } from "./lib/constants";
import { AuthProvider, RequireAuth } from "./components/AuthProvider";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <Routes>
            <Route path={ROUTES.HOME} element={<Index />} />
            <Route path={ROUTES.LOGIN} element={<Login />} />
            <Route path={ROUTES.DASHBOARD} element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            } />
            <Route path={ROUTES.COURSES} element={
              <RequireAuth>
                <Courses />
              </RequireAuth>
            } />
            <Route path={`${ROUTES.COURSES}/editor`} element={
              <RequireAuth>
                <CourseEditor />
              </RequireAuth>
            } />
            <Route path={`${ROUTES.COURSES}/editor/:id`} element={
              <RequireAuth>
                <CourseEditor />
              </RequireAuth>
            } />
            <Route path={`${ROUTES.COURSES}/preview/:id`} element={
              <RequireAuth>
                <CoursePreview />
              </RequireAuth>
            } />
            <Route path={ROUTES.USERS} element={
              <RequireAuth>
                <Users />
              </RequireAuth>
            } />
            <Route path={ROUTES.WHATSAPP} element={
              <RequireAuth>
                <WhatsApp />
              </RequireAuth>
            } />
            <Route path={ROUTES.ANALYTICS} element={
              <RequireAuth>
                <Analytics />
              </RequireAuth>
            } />
            <Route path={ROUTES.SETTINGS} element={
              <RequireAuth>
                <Settings />
              </RequireAuth>
            } />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
