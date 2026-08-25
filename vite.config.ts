import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Production on VPS is served under /charts/
  base: mode === "production" ? "/charts/" : "/",
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
      "/crypto-api": {
        target: "http://185.222.163.116",
        changeOrigin: true,
      },
      "/crypto-ws": {
        target: "ws://185.222.163.116",
        ws: true,
        changeOrigin: true,
      },
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
    },
  },
}));
