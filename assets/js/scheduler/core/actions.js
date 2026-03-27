import { api } from "./api.js";
import { getState, setState } from "./store.js";

function ensureSelectedGoal(goals) {
  const wanted = getState().selectedGoalId;
  const exists = goals.some((goal) => goal.id === wanted);
  if (exists) return wanted;
  return goals[0]?.id || "";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateIso, days) {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function applyQueueState(result) {
  setState({
    queueDate: result.date || todayIso(),
    queueItems: result.items || [],
    queueSession: result.session || null,
  });
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

export async function refreshTimeline(range = {}) {
  const from = range.from || todayIso();
  const to = range.to || addDays(from, 30);
  const result = await api.getTimeline({ from, to });
  setState({
    timelineItems: result.items || [],
    timelineGoals: result.goals || [],
  });
}

export async function refreshTodayQueue(date = todayIso()) {
  const result = await api.getTodayQueue(date);
  applyQueueState(result);
}

export async function bootstrapScheduler() {
  const selectedGoalId = await refreshGoals();
  await refreshGoalData(selectedGoalId);
  await Promise.all([refreshTodayQueue(), refreshTimeline()]);
}

export function selectGoal(goalId) {
  setState({ selectedGoalId: goalId || "", overflow: [] });
}

export async function createGoal(payload) {
  await api.createGoal(payload);
  const selectedGoalId = await refreshGoals();
  await Promise.all([refreshGoalData(selectedGoalId), refreshTimeline(), refreshTodayQueue()]);
}

export async function updateGoal(payload) {
  await api.patchGoal(payload);
  await Promise.all([refreshGoals(), refreshTimeline(), refreshTodayQueue()]);
}

export async function createTask(payload) {
  await api.createTask(payload);
  await Promise.all([refreshGoalData(payload.goal_id), refreshTimeline(), refreshTodayQueue()]);
}

export async function updateTask(payload) {
  await api.patchTask(payload);
  await Promise.all([refreshGoalData(getState().selectedGoalId), refreshTimeline(), refreshTodayQueue()]);
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
    client_today: todayIso(),
  });

  setState({
    schedule: result.items || [],
    overflow: result.overflow || [],
  });

  await Promise.all([refreshTodayQueue(), refreshTimeline()]);
  return result;
}

export async function queueStart(entryId = "") {
  const result = await api.queueStart({ date: getState().queueDate || todayIso(), entry_id: entryId || null });
  applyQueueState(result);
}

export async function queuePause() {
  const result = await api.queuePause({ date: getState().queueDate || todayIso() });
  applyQueueState(result);
}

export async function queueSkip() {
  const result = await api.queueSkip({ date: getState().queueDate || todayIso() });
  applyQueueState(result);
}

export async function queueComplete() {
  const result = await api.queueComplete({ date: getState().queueDate || todayIso() });
  applyQueueState(result);
  await Promise.all([refreshGoalData(), refreshTimeline()]);
}

export async function queueAckBreak() {
  const result = await api.queueAckBreak({ date: getState().queueDate || todayIso() });
  applyQueueState(result);
}
