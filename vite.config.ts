import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // App URL is /charts/; hashed JS/CSS are emitted under /assets/forge/
  // because this VPS path reliably serves large static files (same as goldanil).
  base: mode === "production" ? "/charts/" : "/",
  build: {
    assetsDir: "assets",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react-dom")) return "react-dom";
          if (id.includes("node_modules/react")) return "react";
        },
      },
    },
  },
  experimental: {
    renderBuiltUrl(filename) {
      if (mode === "production" && filename.startsWith("assets/")) {
        return `/assets/forge/${filename.slice("assets/".length)}`;
      }
      return { relative: true as const };
    },
  },
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
      "/crypto-chart": {
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
