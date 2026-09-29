import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

function buildProxy(env: Record<string, string>): Record<string, ProxyOptions> {
  const cpTarget = env.VITE_CP_FETCHER_TARGET || "http://185.222.163.116/crypto-api";
  const marketTarget = env.VITE_MARKET_API_TARGET || "http://185.222.163.116/market-api";
  const chartTarget = env.VITE_CP_CHART_TARGET || "http://185.222.163.116/crypto-chart";
  const cpKey = env.CP_FETCHER_API_KEY || env.MARKET_API_KEY || "";

  return {
    "/market-api": {
      target: marketTarget,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/market-api/, ""),
      headers: cpKey ? { "X-API-Key": cpKey } : {},
    },
    "/crypto-chart": {
      target: chartTarget,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/crypto-chart/, ""),
    },
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
  const production = mode === "production";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    // SPA at /charts/; hashed bundles under /assets/forge/ (nginx).
    base: production ? "/charts/" : "/",
    build: {
      assetsDir: "assets",
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
    experimental: {
      renderBuiltUrl(filename) {
        if (production && filename.startsWith("assets/")) {
          return `/assets/forge/${filename.slice("assets/".length)}`;
        }
        return { relative: true as const };
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
