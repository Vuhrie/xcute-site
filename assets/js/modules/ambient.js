import { canAnimate } from "./motion-utils.js";

function makeStars(count, width, height) {
  const stars = [];
  for (let i = 0; i < count; i += 1) {
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.6 + 0.3,
      twinkle: Math.random() * Math.PI * 2,
      drift: (Math.random() - 0.5) * 0.08,
    });
  }
  return stars;
}

export function initAmbientSpace() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return { setReducedMotion() {}, dispose() {} };

  canvas.className = "c-ambient-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);

  let width = 0;
  let height = 0;
  let stars = [];
  let raf = 0;
  let idleTimer = 0;
  let scrollY = 0;
  let paused = false;
  let scrollRaf = 0;

  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = makeStars(width < 720 ? 42 : 82, width, height);
  };

  const onScroll = () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      scrollY = window.scrollY || 0;
    });
  };

  const drawStars = (t) => {
    ctx.clearRect(0, 0, width, height);
    for (const star of stars) {
      star.x += star.drift;
      if (star.x < -2) star.x = width + 2;
      if (star.x > width + 2) star.x = -2;
      const yOffset = Math.sin(t * 0.0002 + star.twinkle) * 3 + scrollY * 0.015;
      const alpha = 0.2 + (Math.sin(t * 0.0016 + star.twinkle) + 1) * 0.3;
      ctx.beginPath();
      ctx.fillStyle = `rgba(206, 220, 255, ${Math.min(0.9, alpha)})`;
      ctx.arc(star.x, (star.y + yOffset) % (height + 6), star.r, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const loop = (t) => {
    if (!canAnimate() || paused) {
      idleTimer = window.setTimeout(() => {
        raf = requestAnimationFrame(loop);
      }, 260);
      return;
    }
    drawStars(t);
    raf = requestAnimationFrame(loop);
  };

  const onVisibility = () => {
    paused = document.hidden;
  };

  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  raf = requestAnimationFrame(loop);

  return {
    setReducedMotion(reduced) {
      canvas.style.opacity = reduced ? "0.24" : "0.68";
    },
    dispose() {
      cancelAnimationFrame(raf);
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      if (idleTimer) clearTimeout(idleTimer);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.remove();
    },
  };
}
