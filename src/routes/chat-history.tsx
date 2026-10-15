import { createFileRoute } from "@tanstack/react-router";
import ChatHistory from "@/pages/ChatHistory";
import { RequireAuth } from "@/components/AuthProvider";

export const Route = createFileRoute("/chat-history")({
  component: () => (
    <RequireAuth>
      <ChatHistory />
    </RequireAuth>
  ),
});
