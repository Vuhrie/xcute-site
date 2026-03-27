const STORAGE_KEY = "xcute_motion_mode";

function readStoredMode() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "on" || value === "off") return value;
  } catch {}
  return null;
}

function saveStoredMode(mode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {}
}

export function initMotionPreference() {
  const root = document.documentElement;
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const listeners = new Set();
  let mode = readStoredMode();

  const apply = () => {
    const osReduced = media.matches;
    const effectiveMode = mode || (osReduced ? "off" : "on");
    const reduced = effectiveMode !== "on";
    root.dataset.motionMode = effectiveMode;
    root.dataset.reducedMotion = reduced ? "true" : "false";
    listeners.forEach((listener) => listener(reduced, effectiveMode));
    return reduced;
  };

  const setMode = (nextMode, persist = true) => {
    if (nextMode !== "on" && nextMode !== "off") return;
    mode = nextMode;
    if (persist) saveStoredMode(nextMode);
    apply();
  };

  const toggleMode = () => {
    setMode(root.dataset.motionMode === "on" ? "off" : "on", true);
  };

  const onChange = () => {
    if (!mode) apply();
  };

  if (typeof media.addEventListener === "function") media.addEventListener("change", onChange);
  else media.addListener(onChange);

  const isReducedMotion = apply();

  return {
    isReducedMotion,
    getMode() {
      return root.dataset.motionMode === "on" ? "on" : "off";
    },
    toggleMode,
    setMode,
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
