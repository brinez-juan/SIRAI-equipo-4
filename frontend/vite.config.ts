import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    host: true,
    https:{
      // Mismos certificados que el backend (los genera el equipo, no se suben a git)
      key: fs.readFileSync("../backend/backend.key"),
      cert: fs.readFileSync("../backend/backend.crt")
    }

  },
  build: {
    sourcemap: mode === "development",
  },
  base: "./",
}));
