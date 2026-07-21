import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy /api to the FastAPI backend in dev — no CORS involved.
// Stoa's backend runs on 8001 (8000 belongs to another project on this
// machine); override with STOA_API_URL if needed.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": process.env.STOA_API_URL ?? "http://127.0.0.1:8001",
    },
  },
});
