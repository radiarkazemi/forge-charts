window.FORGE_I18N = {
  en: {
    dir: "ltr",
    title: "Forge — The market, without the noise.",
    description: "Professional charting. Real-time data. Intelligent analysis. All in one place.",
    "nav.markets": "Markets",
    "nav.charts": "Charts",
    "nav.screener": "Screener",
    "nav.news": "News",
    "nav.learn": "Learn",
    "nav.search": "Search markets, charts, or anything...",
    "nav.login": "Log in",
    "nav.getStarted": "Get started",
    "hero.eyebrow": "TRADING. ANALYSIS. OPPORTUNITY.",
    "hero.title": "The market,<br /><span class=\"accent\">without the noise.</span>",
    "hero.lead": "Professional charting. Real-time data. Intelligent analysis. All in one place.",
    "hero.search": "Search any market, asset, or indicator...",
    "features.kicker": "ONE WORKSPACE. EVERY MARKET.",
    "features.chartsTitle": "Advanced Charts",
    "features.chartsBody": "100+ indicators, drawing tools, and multiple chart types. Built for precision.",
    "features.screenerTitle": "Smart Screener",
    "features.screenerBody": "Find the best opportunities with powerful, customizable scans.",
    "features.aiTitle": "AI-Powered Analysis",
    "features.aiBody": "Get instant insights, key levels, and market sentiment.",
    "features.alertsTitle": "Real-Time Alerts",
    "features.alertsBody": "Never miss a move. Set alerts for price, indicators, and more.",
    "footer.live": "Live market data",
    "footer.ok": "All systems operational",
    "footer.explore": "Explore all markets →",
  },
  fa: {
    dir: "rtl",
    title: "فورج — بازار، بدون نویز.",
    description: "چارت حرفه‌ای. دادهٔ لحظه‌ای. تحلیل هوشمند. همه در یک جا.",
    "nav.markets": "بازارها",
    "nav.charts": "چارت‌ها",
    "nav.screener": "اسکرینر",
    "nav.news": "اخبار",
    "nav.learn": "آموزش",
    "nav.search": "جستجوی بازار، چارت یا هر چیز...",
    "nav.login": "ورود",
    "nav.getStarted": "شروع کنید",
    "hero.eyebrow": "معامله. تحلیل. فرصت.",
    "hero.title": "بازار،<br /><span class=\"accent\">بدون نویز.</span>",
    "hero.lead": "چارت حرفه‌ای. دادهٔ لحظه‌ای. تحلیل هوشمند. همه در یک جا.",
    "hero.search": "جستجوی هر بازار، دارایی یا اندیکاتور...",
    "features.kicker": "یک فضای کار. همهٔ بازارها.",
    "features.chartsTitle": "چارت‌های پیشرفته",
    "features.chartsBody": "بیش از ۱۰۰ اندیکاتور، ابزار ترسیم و انواع چارت. ساخته‌شده برای دقت.",
    "features.screenerTitle": "اسکرینر هوشمند",
    "features.screenerBody": "بهترین فرصت‌ها را با اسکن‌های قدرتمند و قابل تنظیم پیدا کنید.",
    "features.aiTitle": "تحلیل مبتنی بر هوش مصنوعی",
    "features.aiBody": "بینش فوری، سطوح کلیدی و احساسات بازار را دریافت کنید.",
    "features.alertsTitle": "هشدارهای لحظه‌ای",
    "features.alertsBody": "هیچ حرکتی را از دست ندهید. برای قیمت، اندیکاتور و بیشتر هشدار بگذارید.",
    "footer.live": "دادهٔ زندهٔ بازار",
    "footer.ok": "همهٔ سامانه‌ها فعال",
    "footer.explore": "مشاهدهٔ همهٔ بازارها ←",
  },
};

(() => {
  const STORAGE_KEY = "forge-landing-lang";
  const dict = window.FORGE_I18N;

  function applyLang(lang) {
    const pack = dict[lang] || dict.en;
    const html = document.documentElement;
    html.lang = lang;
    html.dir = pack.dir;
    html.dataset.lang = lang;
    document.title = pack.title;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", pack.description);

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (pack[key] != null) el.textContent = pack[key];
    });
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const key = el.getAttribute("data-i18n-html");
      if (pack[key] != null) el.innerHTML = pack[key];
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (pack[key] != null) el.setAttribute("placeholder", pack[key]);
    });

    document.querySelectorAll(".lang-btn").forEach((btn) => {
      const active = btn.getAttribute("data-lang") === lang;
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function setLang(lang, persist) {
    const next = lang === "fa" ? "fa" : "en";
    applyLang(next);
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
    }
  }

  function isIranPayload(data) {
    if (!data) return false;
    const code = String(data.country_code || data.countryCode || data.loc || "").toUpperCase();
    const name = String(data.country || data.country_name || "").toLowerCase();
    return code === "IR" || name === "iran" || name.includes("iran");
  }

  async function fetchJson(url, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  async function fetchText(url, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  async function detectLang() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "fa" || saved === "en") return saved;
    } catch {
      /* ignore */
    }

    const trace = await fetchText("https://www.cloudflare.com/cdn-cgi/trace", 3000);
    if (trace) {
      const match = /(?:^|\n)loc=([A-Z]{2})/i.exec(trace);
      if (match) return match[1].toUpperCase() === "IR" ? "fa" : "en";
    }

    const ipwho = await fetchJson("https://ipwho.is/", 3500);
    if (ipwho && ipwho.success !== false && (ipwho.country_code || ipwho.country)) {
      return isIranPayload(ipwho) ? "fa" : "en";
    }

    const ipapi = await fetchJson("https://ipapi.co/json/", 3500);
    if (ipapi && (ipapi.country_code || ipapi.country)) {
      return isIranPayload(ipapi) ? "fa" : "en";
    }

    const nav = (navigator.languages && navigator.languages[0]) || navigator.language || "en";
    if (String(nav).toLowerCase().startsWith("fa")) return "fa";
    return "en";
  }

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => setLang(btn.getAttribute("data-lang"), true));
  });

  applyLang("en");
  detectLang().then((lang) => setLang(lang, false));
})();
