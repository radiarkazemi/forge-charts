(() => {
  // ⌘K / Ctrl+K focuses hero search
  const heroInput = document.querySelector(".hero-search input");
  const navInput = document.querySelector(".nav-search input");

  window.addEventListener("keydown", (event) => {
    const meta = event.metaKey || event.ctrlKey;
    if (!meta || String(event.key).toLowerCase() !== "k") return;
    event.preventDefault();
    (heroInput || navInput)?.focus();
  });

  if (navInput && heroInput) {
    navInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      heroInput.value = navInput.value;
      heroInput.form?.requestSubmit();
    });
  }

  // Subtle parallax on product preview
  const preview = document.querySelector(".preview-window");
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (preview && !prefersReduced) {
    let ticking = false;
    window.addEventListener(
      "pointermove",
      (event) => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const x = (event.clientX / window.innerWidth - 0.5) * 8;
          const y = (event.clientY / window.innerHeight - 0.5) * 6;
          preview.style.transform = `rotateY(${-12 + x}deg) rotateX(${4 - y}deg) rotateZ(1deg)`;
          ticking = false;
        });
      },
      { passive: true },
    );
  }
})();
