import { getState } from "./store.js";

async function call(path, { method = "GET", body } = {}) {
  const token = getState().token;
  const response = await fetch(path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error || data?.detail || "request_failed";
    throw new Error(message);
  }
  return data;
}

export const api = {
  health: () => call("/api/health"),
  requestOtp: (email) => call("/api/auth/request-otp", { method: "POST", body: { email } }),
  verifyOtp: (email, otp) => call("/api/auth/verify-otp", { method: "POST", body: { email, otp } }),
  logout: () => call("/api/auth/logout", { method: "POST"}),
  getGoals: () => call("/api/goals"),
  createGoal: (body) => call("/api/goals", { method: "POST", body }),
  patchGoal: (body) => call("/api/goals", { method: "PATCH", body }),
  getMilestones: () => call("/api/milestones"),
  createMilestone: (body) => call("/api/milestones", { method: "POST", body }),
  patchMilestone: (body) => call("/api/milestones", { method: "PATCH", body }),
  getTasks: () => call("/api/tasks"),
  createTask: (body) => call("/api/tasks", { method: "POST", body }),
  patchTask: (body) => call("/api/tasks", { method: "PATCH", body }),
  getPreferences: () => call("/api/preferences"),
  patchPreferences: (body) => call("/api/preferences", { method: "PATCH", body }),
  generate: (date) => call("/api/schedule/generate", { method: "POST", body: { date } }),
  reflow: (date) => call("/api/schedule/reflow", { method: "POST", body: { date } }),
  getDay: (date) => call(`/api/schedule/day?date=${encodeURIComponent(date)}`),
  lockBlock: (id, locked) => call(`/api/blocks/${id}/lock`, { method: "PATCH", body: { locked } }),
  completeBlock: (id, completed) => call(`/api/blocks/${id}/complete`, { method: "PATCH", body: { completed } }),
};
