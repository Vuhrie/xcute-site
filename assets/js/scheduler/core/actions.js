import { api } from "./api.js";
import { getState, setState } from "./store.js";

const DEFAULT_TIMELINE_DAYS = 30;

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

function selectedGoalId() {
  return getState().selectedGoalId || "";
}

function queueDate() {
  return getState().queueDate || todayIso();
}

async function refreshScheduler(goalId = selectedGoalId()) {
  await Promise.all([refreshGoalData(goalId), refreshTimeline(), refreshTodayQueue(), refreshAnalytics()]);
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
  const to = range.to || addDays(from, DEFAULT_TIMELINE_DAYS);
  const result = await api.getTimeline({ from, to });
  setState({
    timelineItems: result.items || [],
    timelineGoals: result.goals || [],
    unscheduledItems: result.unscheduled || [],
  });
}

export async function refreshAnalytics(range = {}) {
  const from = range.from || todayIso();
  const to = range.to || addDays(from, DEFAULT_TIMELINE_DAYS);
  const [day, series] = await Promise.all([api.getAnalyticsDay(todayIso()), api.getAnalyticsRange({ from, to })]);
  setState({
    analyticsDay: day || null,
    analyticsRange: series || null,
  });
}

export async function runDailyRollover(date = todayIso()) {
  const result = await api.rolloverAppOpen({ date });
  setState({
    rolloverBanner: result.banner_message || "",
    rolloverConflicts: result.conflicts || [],
  });
  return result;
}

export async function refreshTodayQueue(date = todayIso()) {
  const result = await api.getTodayQueue(date);
  applyQueueState(result);
}

export async function bootstrapScheduler() {
  try {
    const health = await api.health();
    const serverReady = Boolean(health?.write_key);
    setState({
      writeKeyServerReady: serverReady,
      writeKeyWarning: serverReady ? "" : "Server secret WRITE_API_KEY is not configured yet.",
    });
  } catch {
    setState({ writeKeyServerReady: null });
  }

  const selectedGoalId = await refreshGoals();
  if (getState().writeKey) {
    try {
      await runDailyRollover(todayIso());
    } catch {
      setState({ rolloverBanner: "Rollover unavailable until write key is valid." });
    }
  } else {
    setState({ rolloverBanner: "Set write key to run daily rollover." });
  }
  await refreshScheduler(selectedGoalId);
}

export function selectGoal(goalId) {
  setState({ selectedGoalId: goalId || "", overflow: [] });
}

export async function createGoal(payload) {
  await api.createGoal(payload);
  await refreshScheduler(await refreshGoals());
}

export async function updateGoal(payload) {
  await api.patchGoal(payload);
  await refreshGoals();
  await refreshScheduler();
}

export async function deleteGoal(goalId) {
  const id = String(goalId || "").trim();
  if (!id) return;
  await api.deleteGoal(id);
  await refreshScheduler(await refreshGoals());
}

export async function createTask(payload) {
  await api.createTask(payload);
  await refreshScheduler(payload.goal_id);
}

export async function updateTask(payload) {
  await api.patchTask(payload);
  await refreshScheduler();
}

export async function deleteTask(taskId) {
  const id = String(taskId || "").trim();
  if (!id) return;
  const goalId = selectedGoalId();
  await api.deleteTask(id);
  await refreshScheduler(goalId);
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
  await refreshGoalData(selectedGoalId());
}

export async function spreadSelectedGoal({ startMode, targetDate }) {
  const goalId = selectedGoalId();
  if (!goalId) {
    const error = new Error("goal_required");
    error.code = "goal_required";
    throw error;
  }

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
  await refreshAnalytics();
  return result;
}

async function runQueueAction(request, payload = {}, { refreshSchedulerData = false, refreshAnalyticsData = true } = {}) {
  const result = await request({ date: queueDate(), ...payload });
  applyQueueState(result);
  if (refreshSchedulerData) await Promise.all([refreshGoalData(), refreshTimeline()]);
  if (refreshAnalyticsData) await refreshAnalytics();
}

export async function queueStart(entryId = "") {
  await runQueueAction(api.queueStart, { entry_id: entryId || null });
}

export async function queuePause() {
  await runQueueAction(api.queuePause);
}

export async function queueSkip() {
  await runQueueAction(api.queueSkip);
}

export async function queueComplete() {
  await runQueueAction(api.queueComplete, {}, { refreshSchedulerData: true });
}

export async function queueAckBreak(skipBreak = false) {
  await runQueueAction(api.queueAckBreak, { skip_break: Boolean(skipBreak) });
}

export async function queueReorder(entryId, direction) {
  const result = await api.queueReorder({
    date: queueDate(),
    entry_id: entryId,
    direction,
  });
  applyQueueState(result);
  await refreshAnalytics();
}
