import { bootstrapScheduler, refreshGoalData, refreshTimeline, refreshTodayQueue } from "./core/actions.js";
import { initAmbientSpace } from "../modules/ambient.js";
import { initMotionPreference } from "../modules/motion-pref.js";
import { initMotionToggle } from "../modules/motion-toggle.js";
import { initReveal } from "../modules/reveal.js";
import { initRouteTransitions } from "../modules/route-transition.js";
import { initTiltMotion } from "../modules/tilt.js";
import { getState, subscribe } from "./core/store.js";
import "./components/today-queue-panel.js";
import "./components/write-key-panel.js";
import "./components/goal-panel.js";
import "./components/goal-workspace-panel.js";
import "./components/plan-view.js";

const VERSION_RE = /^v\d+\.\d+\.\d+$/;
const TIMELINE_POLL_MS = 15000;
const motion = initMotionPreference();
const reveal = initReveal({ reducedMotion: motion.isReducedMotion });
const ambient = initAmbientSpace();
initMotionToggle({ motion });
initRouteTransitions();
const tilt = initTiltMotion();
ambient.setReducedMotion(motion.isReducedMotion);
tilt.setReducedMotion(motion.isReducedMotion);

function safeRun(task) {
  Promise.resolve().then(task).catch(() => {});
}

async function loadVersionLabel() {
  const node = document.getElementById("scheduler-version");
  if (!node) return;
  node.textContent = "Version v0.5.0";
  try {
    const text = (await (await fetch("./VERSION", { cache: "no-store" })).text()).trim();
    if (VERSION_RE.test(text)) node.textContent = `Version ${text}`;
  } catch {}
}

let prevGoalId = "";
subscribe((state) => {
  if (!state.selectedGoalId || state.selectedGoalId === prevGoalId) return;
  prevGoalId = state.selectedGoalId;
  safeRun(() => refreshGoalData(state.selectedGoalId));
});

loadVersionLabel();
bootstrapScheduler().catch((error) => console.error(error));
motion.subscribe((isReducedMotion) => {
  reveal.setReducedMotion(isReducedMotion);
  ambient.setReducedMotion(isReducedMotion);
  tilt.setReducedMotion(isReducedMotion);
});

window.addEventListener("focus", () => {
  if (getState().selectedGoalId) safeRun(() => refreshGoalData(getState().selectedGoalId));
  safeRun(() => refreshTodayQueue());
  safeRun(() => refreshTimeline());
});

setInterval(() => {
  safeRun(() => refreshTimeline());
}, TIMELINE_POLL_MS);
