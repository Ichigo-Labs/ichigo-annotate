import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/ichigo-annotate/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "Ichigo Annotate",
        short_name: "Annotate",
        description: "A tablet-first web app for YOLO data annotation",
        start_url: ".",
        display: "standalone",
        background_color: "#1a1a1a",
        theme_color: "#d4856a",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  server: {
    watch: {
      usePolling: true,
      interval: 500,
    },
  },
});
