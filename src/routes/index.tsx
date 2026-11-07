import { createFileRoute } from "@tanstack/react-router";
import { PostureDashboard } from "@/components/PostureDashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Real-Time Posture Detection & Rep Counter" },
      { name: "description", content: "In-browser pose estimation that counts squats and bicep curls and gives live form feedback." },
      { property: "og:title", content: "Real-Time Posture Detection & Rep Counter" },
      { property: "og:description", content: "Count squats and bicep curls with live form feedback using MediaPipe in your browser." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PostureDashboard,
});