function reducedByMode() {
  return document.documentElement.dataset.reducedMotion === "true";
}

export function canAnimate() {
  return !reducedByMode();
}

export function waapi(target, keyframes, options) {
  if (!target || typeof target.animate !== "function" || !canAnimate()) return null;
  return target.animate(keyframes, options);
}

export function pulse(target, scale = 1.01) {
  return waapi(
    target,
    [
      { transform: "translate3d(0,0,0) scale(1)" },
      { transform: `translate3d(0,-2px,0) scale(${scale})` },
      { transform: "translate3d(0,0,0) scale(1)" },
    ],
    { duration: 380, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
  );
}

export function stagger(nodes, keyframes, { baseDelay = 0, each = 50, duration = 420, easing = "cubic-bezier(0.16, 1, 0.3, 1)" } = {}) {
  if (!Array.isArray(nodes) || !nodes.length || !canAnimate()) return;
  nodes.forEach((node, idx) => {
    waapi(node, keyframes, { duration, delay: baseDelay + each * idx, easing, fill: "both" });
  });
}
