
import Sidebar from "@/components/dashboard/Sidebar";
import CoursesList from "@/components/dashboard/CoursesList";
import { MOCK_COURSES } from "@/lib/constants";

const Courses = () => {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto py-6 px-4 md:px-6">
          <header className="mb-6">
            <h1 className="text-2xl font-bold">Course Management</h1>
            <p className="text-muted-foreground">
              Create and manage your learning courses
            </p>
          </header>

          <CoursesList courses={MOCK_COURSES} />
        </div>
      </main>
    </div>
  );
};

export default Courses;
