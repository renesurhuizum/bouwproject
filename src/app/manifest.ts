import type { MetadataRoute } from "next";

// PWA-manifest. Mobiel-first, installeerbaar op telefoon/tablet.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bouwproject — Digital Twin",
    short_name: "Bouwproject",
    description:
      "Plan, ontwerp en bouw je renovatie. Plattegrond, 3D, installaties, fasering en kosten.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f4f1ea",
    theme_color: "#ea580c",
    categories: ["productivity", "utilities"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
