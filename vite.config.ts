import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";

function forgeNewsPlugin(): Plugin {
  return {
    name: "forge-tv-news",
    async configureServer(server: ViteDevServer) {
      if (process.env.NEWS_AUTOSTART === "0") return;
      const { createNewsService } = await import("./server/news/index.mjs");
      const service = createNewsService();
      service.start();
      server.middlewares.use((req, res, next) => {
        const url = req.url || "";
        if (!url.startsWith("/news-api")) {
          next();
          return;
        }
        const orig = req.url;
        req.url = url.slice("/news-api".length) || "/";
        Promise.resolve(service.handleRequest(req, res)).catch(() => {
          req.url = orig;
          next();
        });
      });
      const stop = () => service.stop();
      server.httpServer?.once("close", stop);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const cpTarget = env.VITE_CP_FETCHER_TARGET || "http://185.222.163.116/crypto-api";
  const cpKey = env.CP_FETCHER_API_KEY || "";
  const newsTarget = env.NEWS_ORIGIN || "http://127.0.0.1:8787";

  return {
    plugins: [react(), forgeNewsPlugin()],
    server: {
      port: 5173,
      host: "127.0.0.1",
      proxy: {
        "/news-api": {
          target: newsTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/news-api/, ""),
          timeout: 0,
          proxyTimeout: 0,
        },
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
