import { canAnimate, pulse, stagger, waapi } from "../../modules/motion-utils.js";

const PANEL_IN = [
  { opacity: 0, transform: "translate3d(0, 14px, 0) scale(0.992)" },
  { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
];

const ROW_IN = [
  { opacity: 0, transform: "translate3d(0, 10px, 0)" },
  { opacity: 1, transform: "translate3d(0, 0, 0)" },
];

export function animatePanel(node) {
  if (!node) return;
  waapi(node, PANEL_IN, {
    duration: 440,
    easing: "cubic-bezier(0.2, 0.9, 0.2, 1)",
    fill: "both",
  });
}

export function animateRows(container, selector, each = 48) {
  if (!container || !canAnimate()) return;
  const nodes = Array.from(container.querySelectorAll(selector));
  if (!nodes.length) return;
  stagger(nodes, ROW_IN, { each, duration: 360 });
}

export function animateStateBump(node) {
  if (!node) return;
  pulse(node, 1.01);
}
