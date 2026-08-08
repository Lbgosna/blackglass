import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_PORT = Number(process.env.BLACKGLASS_API_PORT ?? "3001");
const WEB_PORT = Number(process.env.BLACKGLASS_WEB_PORT ?? "5173");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: WEB_PORT,
    strictPort: true,
    proxy: {
      "/health": {
        target: `http://127.0.0.1:${API_PORT}`,
      },
    },
  },
});
