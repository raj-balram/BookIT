import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // forwards /api/* to the backend, so the browser sees ONE origin (no CORS in dev)
    proxy: { "/api": "http://localhost:5000" },
  },
});