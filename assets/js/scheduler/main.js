import { bootstrapScheduler, refreshAnalytics, refreshGoalData, refreshTimeline, refreshTodayQueue } from "./core/actions.js";
import { getState, subscribe } from "./core/store.js";
import "./components/today-queue-panel.js";
import "./components/write-key-panel.js";
import "./components/goal-panel.js";
import "./components/goal-workspace-panel.js";
import "./components/plan-view.js";
import "./components/analytics-panel.js";

const VERSION_RE = /^v\d+\.\d+\.\d+$/;
const TIMELINE_POLL_MS = 15000;

function safeRun(task) {
  Promise.resolve().then(task).catch(() => {});
}

async function loadVersionLabel() {
  const node = document.getElementById("scheduler-version");
  if (!node) return;
  node.textContent = "Version v0.6.0";
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

window.addEventListener("focus", () => {
  if (getState().selectedGoalId) safeRun(() => refreshGoalData(getState().selectedGoalId));
  safeRun(() => refreshTodayQueue());
  safeRun(() => refreshTimeline());
  safeRun(() => refreshAnalytics());
});

setInterval(() => {
  safeRun(() => refreshTimeline());
  safeRun(() => refreshAnalytics());
}, TIMELINE_POLL_MS);
