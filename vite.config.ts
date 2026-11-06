import { copyFileSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Publish a stable `/assets/forge/forge-app.js` entry so deploys never leave
 * index.html pointing at a freshly deleted hashed bundle (Cloudflare caches 404s).
 */
function forgeStableEntryPlugin(): Plugin {
  return {
    name: "forge-stable-entry",
    apply: "build",
    closeBundle() {
      const outDir = join(process.cwd(), "dist");
      const assetsDir = join(outDir, "assets");
      const indexHtmlPath = join(outDir, "index.html");
      const hashed = readdirSync(assetsDir).find(
        (name) => /^index-.*\.js$/.test(name) && !name.endsWith(".map"),
      );
      if (!hashed) {
        throw new Error("forge-stable-entry: no index-*.js in dist/assets");
      }
      // Stable name under /assets/forge/ — bump when CDN has a poisoned cache entry.
      const stableName = "forge-main.js";
      copyFileSync(join(assetsDir, hashed), join(assetsDir, stableName));
      let html = readFileSync(indexHtmlPath, "utf8");
      const next = html
        .replace(/\/assets\/forge\/index-[^"']+\.js/g, `/assets/forge/${stableName}`)
        .replace(/\/assets\/forge\/forge-app\.js/g, `/assets/forge/${stableName}`);
      if (next === html) {
        throw new Error("forge-stable-entry: index.html had no hashed entry to rewrite");
      }
      writeFileSync(indexHtmlPath, next);
      console.log(`forge-stable-entry: ${hashed} → ${stableName}`);
    },
  };
}

function buildProxy(env: Record<string, string>): Record<string, ProxyOptions> {
  const cpTarget = env.VITE_CP_FETCHER_TARGET || "http://185.222.163.116/crypto-api";
  const marketTarget = env.VITE_MARKET_API_TARGET || "http://185.222.163.116/market-api";
  const chartTarget = env.VITE_CP_CHART_TARGET || "http://185.222.163.116/crypto-chart";
  const vpsOrigin = env.VITE_VPS_ORIGIN || "http://185.222.163.116";
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
    // Iran gold history/quote + tick WS (market_ticks.py on VPS :8015)
    "/iran-gold": {
      target: vpsOrigin,
      changeOrigin: true,
    },
    "/market-ticks": {
      target: vpsOrigin,
      changeOrigin: true,
      ws: true,
    },
    // TradingView broker OHLC (same books as TV Supercharts) via market_ticks.py
    "/tv-history": {
      target: vpsOrigin,
      changeOrigin: true,
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const production = mode === "production";

  return {
    plugins: [react(), forgeStableEntryPlugin()],
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
