export function initMotionPreference() {
  const root = document.documentElement;
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const listeners = new Set();

  const apply = () => {
    const reduced = media.matches;
    root.dataset.motionMode = "on";
    root.dataset.reducedMotion = reduced ? "true" : "false";
    listeners.forEach((listener) => listener(reduced, "on"));
    return reduced;
  };

  const onChange = () => {
    apply();
  };

  if (typeof media.addEventListener === "function") media.addEventListener("change", onChange);
  else media.addListener(onChange);

  const isReducedMotion = apply();

  return {
    isReducedMotion,
    getMode() {
      return "on";
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (typeof media.removeEventListener === "function") media.removeEventListener("change", onChange);
      else media.removeListener(onChange);
      listeners.clear();
    },
  };
}
