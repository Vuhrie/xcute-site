import { canAnimate, waapi } from "./motion-utils.js";

function intAttr(node, name, fallback = 0) {
  const value = Number.parseInt(node.dataset[name] || `${fallback}`, 10);
  return Number.isNaN(value) ? fallback : value;
}

function timingFor(target) {
  const role = target.dataset.motionRole || "default";
  if (role === "hero") return { duration: 760, easing: "cubic-bezier(0.16, 1, 0.3, 1)" };
  if (role === "panel") return { duration: 600, easing: "cubic-bezier(0.18, 0.88, 0.32, 1)" };
  if (role === "chip") return { duration: 420, easing: "cubic-bezier(0.25, 0.8, 0.25, 1)" };
  return { duration: 500, easing: "cubic-bezier(0.2, 0.9, 0.2, 1)" };
}

function keyframesFor(kind) {
  if (kind === "zoom-in") {
    return [
      { opacity: 0, transform: "translate3d(0, 16px, 0) scale(0.96)" },
      { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
    ];
  }
  if (kind === "fade-in") {
    return [{ opacity: 0 }, { opacity: 1 }];
  }
  return [
    { opacity: 0, transform: "translate3d(0, 24px, 0)" },
    { opacity: 1, transform: "translate3d(0, 0, 0)" },
  ];
}

function inViewport(node) {
  const rect = node.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  return rect.top < vh * 0.9 && rect.bottom > vh * 0.1;
}

export function initReveal({ reducedMotion = false } = {}) {
  const nodes = Array.from(document.querySelectorAll("[data-animate]"));
  if (!nodes.length) return { setReducedMotion() {}, dispose() {} };

  const runningByNode = new WeakMap();
  let observer = null;
  let revealOrder = 0;

  const cancelRunning = (node) => {
    const running = runningByNode.get(node);
    if (!running) return;
    try {
      running.cancel();
    } catch {}
    runningByNode.delete(node);
  };

  const hideNode = (node) => {
    cancelRunning(node);
    node.classList.remove("is-visible");
    node.style.removeProperty("--delay");
  };

  const revealImmediate = (node) => {
    cancelRunning(node);
    node.classList.add("is-visible");
    node.style.removeProperty("--delay");
  };

  const revealAnimated = (node, order) => {
    const delay = intAttr(node, "delay") + intAttr(node, "stagger") * order;
    const { duration, easing } = timingFor(node);
    const animation = waapi(node, keyframesFor(node.dataset.animate || "fade-up"), {
      duration,
      delay,
      easing,
      fill: "forwards",
    });
    if (!animation) {
      revealImmediate(node);
      return;
    }
    node.style.setProperty("--delay", `${delay}ms`);
    runningByNode.set(node, animation);
    animation.onfinish = () => {
      if (runningByNode.get(node) === animation) runningByNode.delete(node);
      node.classList.add("is-visible");
    };
  };

  const stop = () => {
    if (!observer) return;
    observer.disconnect();
    observer = null;
  };

  const observe = () => {
    stop();
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const node = entry.target;
          if (entry.isIntersecting) {
            if (node.classList.contains("is-visible")) return;
            if (!canAnimate()) {
              revealImmediate(node);
              return;
            }
            revealAnimated(node, revealOrder);
            revealOrder += 1;
            return;
          }
          hideNode(node);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.1 }
    );
    nodes.forEach((node) => observer.observe(node));
  };

  const setReducedMotion = (next) => {
    if (next) {
      stop();
      nodes.forEach((node) => revealImmediate(node));
      return;
    }

    revealOrder = 0;
    nodes.forEach((node) => {
      if (inViewport(node)) {
        if (!canAnimate()) revealImmediate(node);
        else {
          hideNode(node);
          revealAnimated(node, revealOrder);
          revealOrder += 1;
        }
        return;
      }
      hideNode(node);
    });
    observe();
  };

  setReducedMotion(reducedMotion);
  return {
    setReducedMotion,
    dispose() {
      stop();
      nodes.forEach((node) => cancelRunning(node));
    },
  };
}
