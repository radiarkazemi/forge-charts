window.FORGE_I18N = {
  en: {
    dir: "ltr",
    title: "Forge — Real Data. Real Opportunities.",
    description: "Trade smarter with real-time data, advanced analytics and global markets.",
    "nav.home": "Home",
    "nav.markets": "Markets",
    "nav.portfolio": "Portfolio",
    "nav.analytics": "Analytics",
    "nav.more": "More",
    "nav.searchAria": "Search",
    "nav.historyAria": "History",
    "splash.tag": "TRADE · ANALYZE · INVEST",
    "hero.title": "Real Data.<br />Real Opportunities.",
    "hero.sub": "Trade smarter with real-time data, advanced analytics and global markets.",
    "hero.search": "Search assets...",
    "hero.cta": "Get Started",
  },
  fa: {
    dir: "rtl",
    title: "فورج — دادهٔ واقعی. فرصت‌های واقعی.",
    description: "هوشمندتر معامله کنید با داده‌های لحظه‌ای، تحلیل پیشرفته و بازارهای جهانی.",
    "nav.home": "خانه",
    "nav.markets": "بازارها",
    "nav.portfolio": "سبد",
    "nav.analytics": "تحلیل",
    "nav.more": "بیشتر",
    "nav.searchAria": "جستجو",
    "nav.historyAria": "تاریخچه",
    "splash.tag": "معامله · تحلیل · سرمایه‌گذاری",
    "hero.title": "دادهٔ واقعی.<br />فرصت‌های واقعی.",
    "hero.sub": "هوشمندتر معامله کنید با داده‌های لحظه‌ای، تحلیل پیشرفته و بازارهای جهانی.",
    "hero.search": "جستجوی دارایی...",
    "hero.cta": "شروع کنید",
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
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      const key = el.getAttribute("data-i18n-aria");
      if (pack[key] != null) el.setAttribute("aria-label", pack[key]);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (pack[key] != null) el.setAttribute("placeholder", pack[key]);
    });

    document.querySelectorAll(".lang-btn").forEach((btn) => {
      const active = btn.getAttribute("data-lang") === lang;
      btn.setAttribute("aria-pressed", active ? "true" : "false");
      btn.classList.toggle("is-active", active);
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
    btn.addEventListener("click", () => {
      setLang(btn.getAttribute("data-lang"), true);
    });
  });

  applyLang("en");
  detectLang().then((lang) => setLang(lang, false));
})();
