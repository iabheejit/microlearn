import { createFileRoute } from "@tanstack/react-router";
import Index from "@/pages/Index";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "MicroLearn | Ekatra Learning" },
    { name: "description", content: "MicroLearn by Ekatra: short courses and connected learner conversations." },
    { property: "og:title", content: "MicroLearn | Ekatra Learning" },
    { property: "og:description", content: "Short courses and connected learner conversations with Ekatra." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Index,
});
