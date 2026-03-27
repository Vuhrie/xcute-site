import { api } from "./core/api.js";
import { startReminderLoop } from "./core/reminders.js";
import { getState, setState, subscribe } from "./core/store.js";
import "./components/auth-panel.js";
import "./components/conflict-panel.js";
import "./components/goal-board.js";
import "./components/settings-panel.js";
import "./components/task-composer.js";
import "./components/timeline-view.js";

async function loadVersionLabel() {
  const node = document.getElementById("scheduler-version");
  if (!node) return;
  node.textContent = "Version v0.2.0";
  try {
    const text = (await (await fetch("./VERSION", { cache: "no-store" })).text()).trim();
    if (/^v\d+\.\d+\.\d+$/.test(text)) node.textContent = `Version ${text}`;
  } catch {}
}

async function loadAll() {
  if (!getState().token) return;
  try {
    const [goals, milestones, tasks, prefs, day] = await Promise.all([
      api.getGoals(),
      api.getMilestones(),
      api.getTasks(),
      api.getPreferences(),
      api.getDay(getState().date),
    ]);
    setState({
      goals: goals.items || [],
      milestones: milestones.items || [],
      tasks: tasks.items || [],
      preferences: prefs.item || null,
      blocks: day.blocks || [],
      deferred: [],
    });
  } catch (error) {
    console.error(error);
  }
}

document.addEventListener("auth-changed", () => {
  loadAll();
});

document.addEventListener("data-refresh", () => {
  loadAll();
});

let prevDate = getState().date;
subscribe((state) => {
  if (!state.token) return;
  if (state.date !== prevDate) {
    prevDate = state.date;
    api.getDay(state.date).then((day) => setState({ blocks: day.blocks || [] })).catch(() => {});
  }
});

loadVersionLabel();
loadAll();
startReminderLoop();
