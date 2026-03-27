import { canAnimate } from "./motion-utils.js";

function pointerCapable() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export function initTiltMotion() {
  const targets = Array.from(document.querySelectorAll("[data-tilt]"));
  if (!targets.length) return { dispose() {}, setReducedMotion() {} };

  const rafByTarget = new WeakMap();
  const pointerByTarget = new WeakMap();

  const reset = (event) => {
    const target = event.currentTarget;
    target.style.transform = "";
    const raf = rafByTarget.get(target);
    if (raf) {
      cancelAnimationFrame(raf);
      rafByTarget.delete(target);
    }
  };

  const paint = (target) => {
    rafByTarget.delete(target);
    const point = pointerByTarget.get(target);
    if (!point || !canAnimate() || !pointerCapable()) return;
    const rect = target.getBoundingClientRect();
    const px = (point.x - rect.left) / rect.width - 0.5;
    const py = (point.y - rect.top) / rect.height - 0.5;
    const rx = Math.max(-5, Math.min(5, py * -7));
    const ry = Math.max(-7, Math.min(7, px * 8));
    target.style.transform = `perspective(920px) rotateX(${rx}deg) rotateY(${ry}deg) translate3d(0,-2px,0)`;
  };

  const onMove = (event) => {
    if (!canAnimate() || !pointerCapable()) return;
    const target = event.currentTarget;
    pointerByTarget.set(target, { x: event.clientX, y: event.clientY });
    if (rafByTarget.get(target)) return;
    rafByTarget.set(target, requestAnimationFrame(() => paint(target)));
  };

  targets.forEach((target) => {
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerleave", reset);
    target.addEventListener("blur", reset);
  });

  return {
    setReducedMotion(reduced) {
      if (!reduced) return;
      targets.forEach((target) => {
        target.style.transform = "";
      });
    },
    dispose() {
      targets.forEach((target) => {
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerleave", reset);
        target.removeEventListener("blur", reset);
        const raf = rafByTarget.get(target);
        if (raf) cancelAnimationFrame(raf);
      });
    },
  };
}
