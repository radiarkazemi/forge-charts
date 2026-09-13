(() => {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) return;

  const terminal = document.querySelector(".hero-terminal");
  if (!terminal) return;

  let ticking = false;
  window.addEventListener(
    "pointermove",
    (event) => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const rect = terminal.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width - 0.5) * 10;
        const y = ((event.clientY - rect.top) / rect.height - 0.5) * 8;
        terminal.style.transform = `perspective(1200px) rotateY(${x * 0.35}deg) rotateX(${-y * 0.3}deg)`;
        ticking = false;
      });
    },
    { passive: true },
  );
})();
