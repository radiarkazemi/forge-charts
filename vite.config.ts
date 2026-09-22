import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Upstream market-data hosts are reached through the dev-server proxy so that
 * browser code never deals with CORS and server-side API keys never ship to
 * the client bundle. The same paths must be provided by whatever serves the
 * production build (nginx, Cloudflare Worker, etc.).
 */
function buildProxy(env: Record<string, string>): Record<string, ProxyOptions> {
  const cpTarget = env.VITE_CP_FETCHER_TARGET || "http://185.222.163.116/crypto-api";
  const cpKey = env.CP_FETCHER_API_KEY || "";

  return {
    "/api/crypto": {
      target: cpTarget,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api\/crypto/, ""),
      headers: cpKey ? { "X-API-Key": cpKey } : {},
    },
    "/api/binance": {
      target: "https://api.binance.com",
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api\/binance/, ""),
    },
    "/api/yahoo": {
      target: "https://query1.finance.yahoo.com",
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api\/yahoo/, ""),
      headers: { "User-Agent": "Mozilla/5.0 ForgeCharts" },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    build: {
      // Keep long-lived vendor code in its own chunks so app changes don't bust their cache.
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
              { name: "mui", test: /node_modules[\\/](@mui|@emotion)[\\/]/ },
            ],
          },
        },
      },
    },
    server: {
      port: 5173,
      host: "127.0.0.1",
      proxy: buildProxy(env),
    },
    preview: {
      port: 4173,
      proxy: buildProxy(env),
    },
  };
});
