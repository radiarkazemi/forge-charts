(() => {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) return;

  const card = document.querySelector(".card-glass");
  if (!card) return;

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
        card.style.transform = `perspective(900px) rotateY(${x * 0.4}deg) rotateX(${-y * 0.35}deg)`;
        ticking = false;
      });
    },
    { passive: true },
  );
})();
