import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const cpTarget = env.VITE_CP_FETCHER_TARGET || "http://185.222.163.116/crypto-api";
  const cpKey = env.CP_FETCHER_API_KEY || "";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: "127.0.0.1",
      proxy: {
        "/crypto-api": {
          target: cpTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/crypto-api/, ""),
          headers: cpKey ? { "X-API-Key": cpKey } : {},
        },
        "/binance": {
          target: "https://api.binance.com",
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
  };
});
