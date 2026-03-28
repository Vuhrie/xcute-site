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
  unscheduledItems: [],
  rolloverBanner: "",
  rolloverConflicts: [],
  analyticsDay: null,
  analyticsRange: null,
  writeKey: localStorage.getItem("xcute_write_key") || "",
  writeKeyWarning: "",
  writeKeyServerReady: null,
};

const listeners = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  const keys = Object.keys(patch || {});
  let changed = false;
  for (const key of keys) {
    const nextValue = patch[key];
    if (Object.is(state[key], nextValue)) continue;
    state[key] = nextValue;
    changed = true;
  }
  if (!changed) return false;
  for (const listener of listeners) listener(state);
  return true;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function subscribeSelector(selector, listener, isEqual = Object.is) {
  if (typeof selector !== "function" || typeof listener !== "function") {
    return () => {};
  }
  let prev = selector(state);
  return subscribe((nextState) => {
    const next = selector(nextState);
    if (isEqual(prev, next)) return;
    const old = prev;
    prev = next;
    listener(next, old, nextState);
  });
}

export function setWriteKey(value) {
  const key = String(value || "").trim();
  if (key) localStorage.setItem("xcute_write_key", key);
  else localStorage.removeItem("xcute_write_key");
  setState({ writeKey: key });
}
