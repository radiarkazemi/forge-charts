(() => {
  const PROFILE_KEY = "forge.userProfile";

  function load() {
    try {
      return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null") || {};
    } catch {
      return {};
    }
  }

  function save(data) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
  }

  const form = document.getElementById("profile-form");
  const status = document.getElementById("profile-status");
  const avatar = document.getElementById("profile-avatar");
  const openCharts = document.getElementById("open-charts");
  const resetBtn = document.getElementById("reset-profile");
  const symbolInput = document.getElementById("defaultSymbol");
  const chips = Array.from(document.querySelectorAll(".symbol-chip"));

  function showStatus(message) {
    if (!status) return;
    status.hidden = false;
    status.textContent = message;
    status.classList.add("is-on");
    clearTimeout(showStatus._t);
    showStatus._t = setTimeout(() => {
      status.hidden = true;
      status.classList.remove("is-on");
    }, 2200);
  }

  function setSymbol(symbol) {
    const next = symbol || "BTCUSDT";
    if (symbolInput) symbolInput.value = next;
    chips.forEach((chip) => {
      const on = chip.getAttribute("data-symbol") === next;
      chip.classList.toggle("is-active", on);
      chip.setAttribute("aria-pressed", on ? "true" : "false");
    });
    if (openCharts) {
      openCharts.href = `/charts/?symbol=${encodeURIComponent(next)}`;
    }
  }

  function paint(profile) {
    const name = profile.displayName || "Forge";
    if (avatar) avatar.textContent = name.trim().charAt(0).toUpperCase() || "F";
    form.displayName.value = profile.displayName || "";
    form.email.value = profile.email || "";
    form.theme.value = profile.theme || "dark";
    form.syncWatchlist.checked = profile.syncWatchlist !== false;
    setSymbol(profile.defaultSymbol || "BTCUSDT");
    document.documentElement.dataset.theme = form.theme.value;
  }

  paint(load());

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      setSymbol(chip.getAttribute("data-symbol"));
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const next = {
      displayName: String(form.displayName.value || "").trim(),
      email: String(form.email.value || "").trim(),
      defaultSymbol: (symbolInput && symbolInput.value) || "BTCUSDT",
      theme: form.theme.value || "dark",
      syncWatchlist: !!form.syncWatchlist.checked,
      updatedAt: Date.now(),
    };
    save(next);
    paint(next);
    const fa = document.documentElement.lang === "fa";
    showStatus(fa ? "ذخیره شد" : "Saved");
  });

  resetBtn?.addEventListener("click", () => {
    localStorage.removeItem(PROFILE_KEY);
    paint({});
    const fa = document.documentElement.lang === "fa";
    showStatus(fa ? "بازنشانی شد" : "Reset");
  });
})();
