(() => {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) return;

  // Soft parallax on the chart silhouette
  const chart = document.querySelector(".hero-chart");
  if (!chart) return;

  let ticking = false;
  window.addEventListener(
    "pointermove",
    (event) => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const x = (event.clientX / window.innerWidth - 0.5) * 12;
        const y = (event.clientY / window.innerHeight - 0.5) * 8;
        chart.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        ticking = false;
      });
    },
    { passive: true },
  );
})();
