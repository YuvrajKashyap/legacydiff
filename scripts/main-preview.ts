import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Main renderer uses its pinned source and dependencies, with Working's
// infrastructure. Never load Main's backend or private environment file here.
const mainRoot = process.env.LEGACYDIFF_MAIN_PREVIEW_ROOT;
if (!mainRoot) throw new Error("Main preview checkout is not configured.");

export default defineConfig({
  // Support the last merged layout until this local reorganization is merged.
  root: resolve(
    mainRoot,
    existsSync(resolve(mainRoot, "frontend")) ? "frontend" : "apps/web",
  ),
  base: "/main/",
  envDir: false,
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5175,
    strictPort: true,
    origin: "http://127.0.0.1:5174",
    hmr: { host: "127.0.0.1", clientPort: 5174, path: "hmr" },
    fs: { allow: [mainRoot, resolve(import.meta.dirname, "..")] },
  },
});
