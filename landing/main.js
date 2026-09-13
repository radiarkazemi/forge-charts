(() => {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) return;

  const card = document.querySelector(".feature-card");
  if (card) {
    let ticking = false;
    window.addEventListener(
      "pointermove",
      (event) => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const rect = card.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width - 0.5) * 8;
          const y = ((event.clientY - rect.top) / rect.height - 0.5) * 6;
          card.style.transform = `perspective(900px) rotateY(${x * 0.35}deg) rotateX(${-y * 0.3}deg)`;
          ticking = false;
        });
      },
      { passive: true },
    );
  }

  const search = document.querySelector(".search input");
  if (search) {
    search.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const q = String(search.value || "").trim();
      const url = q ? `/charts/?symbol=${encodeURIComponent(q)}` : "/charts/";
      window.location.href = url;
    });
  }
})();
