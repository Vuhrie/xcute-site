const state = {
  date: new Date().toISOString().slice(0, 10),
  selectedGoalId: "",
  goals: [],
  tasks: [],
  schedule: [],
  overflow: [],
  queueDate: new Date().toISOString().slice(0, 10),
  queueItems: [],
  queueSession: null,
  timelineItems: [],
  timelineGoals: [],
  writeKey: localStorage.getItem("xcute_write_key") || "",
  writeKeyWarning: "",
  writeKeyServerReady: null,
};

const listeners = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch);
  for (const listener of listeners) listener(state);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setWriteKey(value) {
  const key = String(value || "").trim();
  if (key) localStorage.setItem("xcute_write_key", key);
  else localStorage.removeItem("xcute_write_key");
  setState({ writeKey: key });
}
