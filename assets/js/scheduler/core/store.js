const state = {
  token: localStorage.getItem("xcute_token") || "",
  user: null,
  date: new Date().toISOString().slice(0, 10),
  goals: [],
  milestones: [],
  tasks: [],
  blocks: [],
  deferred: [],
  preferences: null,
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

export function setToken(token) {
  if (token) localStorage.setItem("xcute_token", token);
  else localStorage.removeItem("xcute_token");
  setState({ token: token || "" });
}

