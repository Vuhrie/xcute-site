import { api } from "./api.js";
import { getState, setState } from "./store.js";

function ensureSelectedGoal(goals) {
  const wanted = getState().selectedGoalId;
  const exists = goals.some((goal) => goal.id === wanted);
  if (exists) return wanted;
  return goals[0]?.id || "";
}

export async function refreshGoals() {
  const result = await api.getGoals();
  const goals = result.items || [];
  const selectedGoalId = ensureSelectedGoal(goals);
  setState({ goals, selectedGoalId });
  return selectedGoalId;
}

export async function refreshGoalData(goalId = getState().selectedGoalId) {
  if (!goalId) {
    setState({ tasks: [], schedule: [], overflow: [] });
    return;
  }

  const [tasks, schedule] = await Promise.all([api.getTasks(goalId), api.getGoalSchedule(goalId)]);
  setState({
    tasks: tasks.items || [],
    schedule: schedule.items || [],
  });
}

export async function bootstrapScheduler() {
  const selectedGoalId = await refreshGoals();
  await refreshGoalData(selectedGoalId);
}

export function selectGoal(goalId) {
  setState({ selectedGoalId: goalId || "", overflow: [] });
}

export async function createGoal(payload) {
  await api.createGoal(payload);
  const selectedGoalId = await refreshGoals();
  await refreshGoalData(selectedGoalId);
}

export async function updateGoal(payload) {
  await api.patchGoal(payload);
  await refreshGoals();
}

export async function createTask(payload) {
  await api.createTask(payload);
  await refreshGoalData(payload.goal_id);
}

export async function updateTask(payload) {
  await api.patchTask(payload);
  await refreshGoalData(getState().selectedGoalId);
}

export async function reorderTask(taskId, direction) {
  const tasks = [...getState().tasks];
  const index = tasks.findIndex((task) => task.id === taskId);
  if (index === -1) return;

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= tasks.length) return;

  const temp = tasks[index];
  tasks[index] = tasks[target];
  tasks[target] = temp;

  const updates = tasks.map((task, idx) => ({
    id: task.id,
    priority_rank: idx + 1,
  }));

  await Promise.all(updates.map((update) => api.patchTask(update)));
  await refreshGoalData(getState().selectedGoalId);
}

export async function spreadSelectedGoal({ startMode, targetDate }) {
  const goalId = getState().selectedGoalId;
  if (!goalId) throw new Error("goal_required");

  const result = await api.spread({
    goal_id: goalId,
    start_mode: startMode === "tomorrow" ? "tomorrow" : "today",
    target_date: targetDate || null,
    client_today: new Date().toISOString().slice(0, 10),
  });

  setState({
    schedule: result.items || [],
    overflow: result.overflow || [],
  });

  return result;
}
