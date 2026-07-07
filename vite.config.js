import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  server: {
    host: true,
  },
  plugins: [
    react(),
    {
      name: "full-reload-on-hook-change",
      handleHotUpdate({ file, server }) {
        if (file.includes("/src/hooks/") || file.includes("/src/pages/")) {
          server.ws.send({ type: "full-reload" });
          return [];
        }
      },
    },
  ],
});
