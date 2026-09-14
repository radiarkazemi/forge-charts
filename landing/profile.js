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

  function paint(profile) {
    const name = profile.displayName || "Forge";
    if (avatar) avatar.textContent = name.trim().charAt(0).toUpperCase() || "F";
    form.displayName.value = profile.displayName || "";
    form.email.value = profile.email || "";
    form.defaultSymbol.value = profile.defaultSymbol || "BTCUSDT";
    form.theme.value = profile.theme || "dark";
    form.syncWatchlist.checked = profile.syncWatchlist !== false;
    if (openCharts) {
      openCharts.href = `/charts/?symbol=${encodeURIComponent(form.defaultSymbol.value)}`;
    }
    document.documentElement.dataset.theme = form.theme.value;
  }

  paint(load());

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const next = {
      displayName: String(form.displayName.value || "").trim(),
      email: String(form.email.value || "").trim(),
      defaultSymbol: form.defaultSymbol.value || "BTCUSDT",
      theme: form.theme.value || "dark",
      syncWatchlist: !!form.syncWatchlist.checked,
      updatedAt: Date.now(),
    };
    save(next);
    paint(next);
    if (status) {
      status.hidden = false;
      status.textContent = document.documentElement.lang === "fa" ? "ذخیره شد" : "Saved";
      setTimeout(() => {
        status.hidden = true;
      }, 1800);
    }
  });

  form.defaultSymbol.addEventListener("change", () => {
    if (openCharts) {
      openCharts.href = `/charts/?symbol=${encodeURIComponent(form.defaultSymbol.value)}`;
    }
  });

  resetBtn?.addEventListener("click", () => {
    localStorage.removeItem(PROFILE_KEY);
    paint({});
    if (status) {
      status.hidden = false;
      status.textContent = document.documentElement.lang === "fa" ? "بازنشانی شد" : "Reset";
      setTimeout(() => {
        status.hidden = true;
      }, 1800);
    }
  });
})();
