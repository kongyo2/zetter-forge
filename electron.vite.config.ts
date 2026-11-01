import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";

const shared = resolve(__dirname, "src/shared");

function strictCsp(): Plugin {
  return {
    name: "zetter-forge:strict-csp",
    apply: "build",
    transformIndexHtml: (html) => html.replace(/(connect-src[^;"]*?) ws:/u, "$1"),
  };
}

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
    plugins: [react(), strictCsp()],
  },
});
