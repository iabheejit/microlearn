import { createFileRoute } from "@tanstack/react-router";
import ChatHistory from "@/pages/ChatHistory";
import { RequireAuth } from "@/components/AuthProvider";

export const Route = createFileRoute("/chat-history")({
  head: () => ({
    meta: [
      { title: "Chat History | Ekatra MicroLearn" },
      { name: "description", content: "Manage learner WhatsApp and Telegram conversations and track message delivery in Ekatra." },
      { property: "og:title", content: "Chat History | Ekatra MicroLearn" },
      { property: "og:description", content: "Manage learner conversations and track WhatsApp and Telegram messages in Ekatra." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <ChatHistory />
    </RequireAuth>
  ),
});
