import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    allowedHosts: true,
    hmr: {
      protocol: "ws",
      host: "localhost",
      clientPort: 5173,
    },
    proxy: {
      "/binance": {
        target: "https://data-api.binance.vision",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/binance/, ""),
      },
      "/yahoo": {
        target: "https://query1.finance.yahoo.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/yahoo/, ""),
        headers: { "User-Agent": "Mozilla/5.0 ForgeCharts" },
      },
      "/cp": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/cp/, ""),
      },
    },
  },
});
