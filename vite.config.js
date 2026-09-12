import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],

  root: path.resolve(__dirname, "frontend"),

  build: {
    outDir: path.resolve(__dirname, "public"),
    emptyOutDir: true,

    rollupOptions: {
      input: {
        index: path.resolve(
          __dirname,
          "frontend/index.html"
        ),
        admin: path.resolve(
          __dirname,
          "frontend/admin.html"
        ),
        "admin-login": path.resolve(
          __dirname,
          "frontend/admin-login.html"
        )
      }
    }
  }
});