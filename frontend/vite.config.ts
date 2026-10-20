import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    host: true,
    https:{
      key: fs.readFileSync("./frontend.key"),
      cert: fs.readFileSync("./frontend.crt")
    }

  },
  build: {
    sourcemap: mode === "development",
  },
  base: "./",
}));
