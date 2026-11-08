import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "frontend",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    proxy: {
      "/main": { target: "http://127.0.0.1:5175", ws: true },
    },
    fs: { allow: ["."] },
  },
  build: { outDir: "../dist", emptyOutDir: true },
});
