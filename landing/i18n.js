window.FORGE_I18N = {
  en: {
    dir: "ltr",
    title: "Forge — Smarter Trading for a Bigger Tomorrow",
    description: "Forge Charts — global markets, advanced analytics, built for serious investors.",
    "nav.markets": "Markets",
    "nav.analytics": "Analytics",
    "nav.portfolio": "Portfolio",
    "nav.more": "More",
    "nav.searchAria": "Open charts",
    "nav.accountAria": "Open Supercharts",
    "hero.title": "Smarter Trading<br />for a Bigger Tomorrow",
    "hero.sub": "Global markets. Advanced analytics. Built for serious investors.",
    "hero.cta": "Get Started",
    "stats.markets": "Global Markets",
    "stats.data": "Real-Time Data",
    "stats.traders": "Active Traders",
    "split.kicker": "TRADE · ANALYZE · INVEST",
    "split.title": "Simple. Powerful. International.",
    "split.body":
      "Forge Supercharts give you dense drawings, multi-pane layouts, strategy tools, and embeddable terminals — ready for desks that ship product, not slides.",
    "split.cta": "Open Supercharts",
    "bullets.marketsTitle": "Markets",
    "bullets.marketsBody": "FX, crypto, metals — live and replayable.",
    "bullets.analyticsTitle": "Analytics",
    "bullets.analyticsBody": "Indicators, Pine subset, equity curves.",
    "bullets.portfolioTitle": "Portfolio",
    "bullets.portfolioBody": "Paper ticket, broker hooks, screener dock.",
    "more.title": "Built to ship inside your product",
    "more.body":
      "Embed the full terminal in your app, keep your brand on top, and give traders the desk tools they expect — without stitching together widgets.",
    "more.cta": "Try embed mode",
    "footer.tag": "TRADE · ANALYZE · INVEST",
  },
  fa: {
    dir: "rtl",
    title: "فورج — معامله‌گری هوشمند برای فردایی بزرگ‌تر",
    description: "فورج چارتس — بازارهای جهانی، تحلیل پیشرفته، ساخته‌شده برای سرمایه‌گذاران جدی.",
    "nav.markets": "بازارها",
    "nav.analytics": "تحلیل",
    "nav.portfolio": "سبد",
    "nav.more": "بیشتر",
    "nav.searchAria": "باز کردن چارت‌ها",
    "nav.accountAria": "باز کردن سوپرچارتس",
    "hero.title": "معامله‌گری هوشمند<br />برای فردایی بزرگ‌تر",
    "hero.sub": "بازارهای جهانی. تحلیل پیشرفته. ساخته‌شده برای سرمایه‌گذاران جدی.",
    "hero.cta": "شروع کنید",
    "stats.markets": "بازار جهانی",
    "stats.data": "دادهٔ لحظه‌ای",
    "stats.traders": "معامله‌گر فعال",
    "split.kicker": "معامله · تحلیل · سرمایه‌گذاری",
    "split.title": "ساده. قدرتمند. بین‌المللی.",
    "split.body":
      "سوپرچارتس فورج ابزارهای ترسیم متراکم، چیدمان چندپنلی، استراتژی و ترمینال قابل‌تعبیه را در اختیار شما می‌گذارد — آماده برای محصول واقعی، نه فقط اسلاید.",
    "split.cta": "باز کردن سوپرچارتس",
    "bullets.marketsTitle": "بازارها",
    "bullets.marketsBody": "فارکس، کریپتو، فلزات — زنده و قابل بازپخش.",
    "bullets.analyticsTitle": "تحلیل",
    "bullets.analyticsBody": "اندیکاتورها، زیرمجموعهٔ پاین، منحنی سود.",
    "bullets.portfolioTitle": "سبد",
    "bullets.portfolioBody": "سفارش آزمایشی، اتصال کارگزار، اسکینر.",
    "more.title": "برای جاسازی در محصول شما ساخته شده",
    "more.body":
      "ترمینال کامل را در اپ خود قرار دهید، برند خود را حفظ کنید و ابزارهایی که معامله‌گران انتظار دارند را بدون چسباندن ویجت‌های پراکنده ارائه دهید.",
    "more.cta": "حالت تعبیه را ببینید",
    "footer.tag": "معامله · تحلیل · سرمایه‌گذاری",
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

    document.querySelectorAll(".cta-arrow").forEach((el) => {
      el.textContent = lang === "fa" ? "←" : "→";
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

    // Cloudflare trace (often works when other geo APIs are blocked in IR)
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
