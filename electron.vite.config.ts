import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

const shared = resolve(__dirname, "src/shared");

export default defineConfig({
  main: {
    resolve: { alias: { "@shared": shared } },
    build: { outDir: "dist/main" },
  },
  preload: {
    resolve: { alias: { "@shared": shared } },
    build: { outDir: "dist/preload" },
  },
  renderer: {
    resolve: { alias: { "@shared": shared } },
    build: { outDir: "dist/renderer" },
    plugins: [react()],
  },
});
