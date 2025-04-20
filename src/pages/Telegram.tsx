
import Sidebar from "@/components/dashboard/Sidebar";
import TelegramIntegration from "@/components/dashboard/TelegramIntegration";

const Telegram = () => {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto py-6 px-4 md:px-6">
          <header className="mb-6">
            <h1 className="text-2xl font-bold">Telegram Integration</h1>
            <p className="text-muted-foreground">
              Manage your Telegram Bot integration and message templates
            </p>
          </header>

          <TelegramIntegration />
        </div>
      </main>
    </div>
  );
};

export default Telegram;
