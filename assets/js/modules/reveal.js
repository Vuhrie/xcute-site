import { canAnimate, waapi } from "./motion-utils.js";

const MAX_MOBILE_ANIMATIONS = 18;

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

function revealImmediate(node) {
  node.classList.add("is-visible");
  node.style.removeProperty("--delay");
}

function revealAnimated(node, order) {
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
  animation.onfinish = () => node.classList.add("is-visible");
}

function isMobileCapReached(animatedCount) {
  if (!window.matchMedia("(max-width: 820px)").matches) return false;
  return animatedCount >= MAX_MOBILE_ANIMATIONS;
}

export function initReveal({ reducedMotion = false } = {}) {
  const nodes = Array.from(document.querySelectorAll("[data-animate]"));
  if (!nodes.length) return { setReducedMotion() {}, dispose() {} };

  let observer = null;
  let animatedCount = 0;
  let order = 0;

  const stop = () => {
    if (!observer) return;
    observer.disconnect();
    observer = null;
  };

  const showAllNow = () => {
    stop();
    nodes.forEach((node) => revealImmediate(node));
  };

  const observe = () => {
    stop();
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const node = entry.target;
          observer.unobserve(node);
          if (!canAnimate() || isMobileCapReached(animatedCount)) {
            revealImmediate(node);
            animatedCount += 1;
            return;
          }
          revealAnimated(node, order);
          order += 1;
          animatedCount += 1;
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.14 }
    );
    nodes.forEach((node) => observer.observe(node));
  };

  const setReducedMotion = (next) => {
    if (next) {
      showAllNow();
      return;
    }
    animatedCount = 0;
    order = 0;
    nodes.forEach((node) => {
      node.classList.remove("is-visible");
      node.style.removeProperty("--delay");
    });
    observe();
  };

  setReducedMotion(reducedMotion);
  return { setReducedMotion, dispose: stop };
}
