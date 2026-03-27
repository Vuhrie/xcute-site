import { bootstrapScheduler, refreshGoalData } from "./core/actions.js";
import { getState, subscribe } from "./core/store.js";
import "./components/write-key-panel.js";
import "./components/goal-panel.js";
import "./components/task-panel.js";
import "./components/spread-panel.js";
import "./components/plan-view.js";

async function loadVersionLabel() {
  const node = document.getElementById("scheduler-version");
  if (!node) return;
  node.textContent = "Version v0.3.0";
  try {
    const text = (await (await fetch("./VERSION", { cache: "no-store" })).text()).trim();
    if (/^v\d+\.\d+\.\d+$/.test(text)) node.textContent = `Version ${text}`;
  } catch {}
}

let prevGoalId = "";
subscribe((state) => {
  if (!state.selectedGoalId || state.selectedGoalId === prevGoalId) return;
  prevGoalId = state.selectedGoalId;
  refreshGoalData(state.selectedGoalId).catch(() => {});
});

loadVersionLabel();
bootstrapScheduler().catch((error) => console.error(error));

window.addEventListener("focus", () => {
  if (getState().selectedGoalId) refreshGoalData(getState().selectedGoalId).catch(() => {});
});
