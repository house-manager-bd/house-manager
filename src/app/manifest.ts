import type { MetadataRoute } from "next";

// F12: lets phones add the site to the home screen with the right name,
// colour and icon. One manifest serves both languages, so it uses the
// brand name, which is the same in both.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "House Manager",
    short_name: "House Manager",
    description: "Broker-free homes in Dhaka.",
    start_url: "/bn",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0F766E",
    lang: "bn",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
