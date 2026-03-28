import { getState, setState } from "./store.js";

const WRITE_KEY_HELP = "Write key missing or incorrect. Update it and click Save Key.";
const SERVER_KEY_HELP = "Server secret WRITE_API_KEY is not configured yet.";

function codeFromError(error) {
  return String(error?.code || error?.message || "request_failed");
}

export function toUiError(error) {
  const code = codeFromError(error);
  if (code === "forbidden" || code === "missing_write_key") return WRITE_KEY_HELP;
  if (code === "write_key_not_configured") return SERVER_KEY_HELP;
  if (code === "active_item_locked") return "Active queue item cannot be reordered.";
  if (code === "request_failed") return "Request failed. Please try again.";
  return code.replaceAll("_", " ");
}

function setWriteKeyWarning(message) {
  setState({ writeKeyWarning: message || "" });
}

async function call(path, { method = "GET", body } = {}) {
  const upper = method.toUpperCase();
  const needsWriteKey = upper !== "GET";
  const key = getState().writeKey;

  if (needsWriteKey && !key) {
    setWriteKeyWarning(WRITE_KEY_HELP);
    const error = new Error("missing_write_key");
    error.code = "missing_write_key";
    throw error;
  }

  const response = await fetch(path, {
    method: upper,
    headers: {
      "content-type": "application/json",
      ...(needsWriteKey ? { "x-write-key": key } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = String(data?.error || data?.detail || "request_failed");
    if (code === "forbidden" || code === "missing_write_key") setWriteKeyWarning(WRITE_KEY_HELP);
    if (code === "write_key_not_configured") setWriteKeyWarning(SERVER_KEY_HELP);
    const error = new Error(code);
    error.code = code;
    throw error;
  }

  if (needsWriteKey) setWriteKeyWarning("");
  return data;
}

export const api = {
  health: () => call("/api/health"),
  getGoals: () => call("/api/goals"),
  createGoal: (payload) => call("/api/goals", { method: "POST", body: payload }),
  patchGoal: (payload) => call("/api/goals", { method: "PATCH", body: payload }),
  deleteGoal: (id) => call(`/api/goals?id=${encodeURIComponent(id || "")}`, { method: "DELETE" }),
  getTasks: (goalId) => call(`/api/tasks?goal_id=${encodeURIComponent(goalId || "")}`),
  createTask: (payload) => call("/api/tasks", { method: "POST", body: payload }),
  patchTask: (payload) => call("/api/tasks", { method: "PATCH", body: payload }),
  deleteTask: (id) => call(`/api/tasks?id=${encodeURIComponent(id || "")}`, { method: "DELETE" }),
  spread: (payload) => call("/api/schedule/spread", { method: "POST", body: payload }),
  getGoalSchedule: (goalId) => call(`/api/schedule/goal?goal_id=${encodeURIComponent(goalId || "")}`),
  getTimeline: ({ from, to } = {}) =>
    call(`/api/schedule/timeline?from=${encodeURIComponent(from || "")}&to=${encodeURIComponent(to || "")}`),
  rolloverAppOpen: (payload) => call("/api/rollover/app-open", { method: "POST", body: payload }),
  getAnalyticsDay: (date) => call(`/api/analytics/day?date=${encodeURIComponent(date || "")}`),
  getAnalyticsRange: ({ from, to } = {}) =>
    call(`/api/analytics/range?from=${encodeURIComponent(from || "")}&to=${encodeURIComponent(to || "")}`),
  getTodayQueue: (date) => call(`/api/queue/today?date=${encodeURIComponent(date || "")}`),
  queueStart: (payload) => call("/api/queue/start", { method: "POST", body: payload }),
  queuePause: (payload) => call("/api/queue/pause", { method: "POST", body: payload }),
  queueSkip: (payload) => call("/api/queue/skip", { method: "POST", body: payload }),
  queueReorder: (payload) => call("/api/queue/reorder", { method: "POST", body: payload }),
  queueComplete: (payload) => call("/api/queue/complete", { method: "POST", body: payload }),
  queueAckBreak: (payload) => call("/api/queue/break/ack", { method: "POST", body: payload }),
};
