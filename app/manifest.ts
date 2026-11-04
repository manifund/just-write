import type { MetadataRoute } from "next";

// Makes the site installable as an app. It opens on the member portal; signed-out
// visitors get sent to /sign-in from there. Icons are in public/icons (rendered from app/icon.svg).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/home",
    name: "Just Write",
    short_name: "Just Write",
    description: "An online writing club. 4 essays over 4 weeks in November.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#f9eeec",
    theme_color: "#38213f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Home", url: "/home" },
      { name: "#general", url: "/chat/general" },
      { name: "#check-ins", url: "/chat/check-ins" },
      { name: "Ideas", url: "/ideas" },
    ],
    // Sharing a link to the app opens the essay form with it filled in (see RegisterEssay).
    share_target: {
      action: "/home",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
