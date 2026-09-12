import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],

  root: path.resolve(
    __dirname,
    "frontend"
  ),

  build: {
    outDir: path.resolve(
      __dirname,
      "public"
    ),

    emptyOutDir: true
  }
});