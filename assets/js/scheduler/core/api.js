import { getState } from "./store.js";

async function call(path, { method = "GET", body } = {}) {
  const upper = method.toUpperCase();
  const needsWriteKey = upper !== "GET";
  const key = getState().writeKey;

  if (needsWriteKey && !key) {
    throw new Error("missing_write_key");
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
    throw new Error(data?.error || data?.detail || "request_failed");
  }
  return data;
}

export const api = {
  health: () => call("/api/health"),
  getGoals: () => call("/api/goals"),
  createGoal: (payload) => call("/api/goals", { method: "POST", body: payload }),
  patchGoal: (payload) => call("/api/goals", { method: "PATCH", body: payload }),
  getTasks: (goalId) => call(`/api/tasks?goal_id=${encodeURIComponent(goalId || "")}`),
  createTask: (payload) => call("/api/tasks", { method: "POST", body: payload }),
  patchTask: (payload) => call("/api/tasks", { method: "PATCH", body: payload }),
  spread: (payload) => call("/api/schedule/spread", { method: "POST", body: payload }),
  getGoalSchedule: (goalId) => call(`/api/schedule/goal?goal_id=${encodeURIComponent(goalId || "")}`),
  getTimeline: ({ from, to } = {}) =>
    call(`/api/schedule/timeline?from=${encodeURIComponent(from || "")}&to=${encodeURIComponent(to || "")}`),
  getTodayQueue: (date) => call(`/api/queue/today?date=${encodeURIComponent(date || "")}`),
  queueStart: (payload) => call("/api/queue/start", { method: "POST", body: payload }),
  queuePause: (payload) => call("/api/queue/pause", { method: "POST", body: payload }),
  queueSkip: (payload) => call("/api/queue/skip", { method: "POST", body: payload }),
  queueComplete: (payload) => call("/api/queue/complete", { method: "POST", body: payload }),
  queueAckBreak: (payload) => call("/api/queue/break/ack", { method: "POST", body: payload }),
};
