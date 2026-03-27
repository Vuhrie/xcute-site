export function initMotionPreference() {
  const root = document.documentElement;
  const listeners = new Set();

  const cannotRunMotion =
    typeof document === "undefined" ||
    !document.documentElement ||
    typeof document.documentElement.animate !== "function" ||
    typeof window.IntersectionObserver !== "function";

  const apply = () => {
    const reduced = cannotRunMotion;
    root.dataset.motionMode = "on";
    root.dataset.reducedMotion = reduced ? "true" : "false";
    listeners.forEach((listener) => listener(reduced, "on"));
    return reduced;
  };

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
      listeners.clear();
    },
  };
}
