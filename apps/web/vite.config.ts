import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "apps/web",
  plugins: [react()],
  build: { outDir: "../../dist/web", emptyOutDir: true },
  server: {
    host: "127.0.0.1",
    allowedHosts: ["desktop-qh1psr0.tail4ad7d7.ts.net"],
    proxy: {
      "/api": {
        target: process.env.NEXORA_API_TARGET ?? "http://127.0.0.1:3000",
        ws: true,
      },
    },
  },
});
