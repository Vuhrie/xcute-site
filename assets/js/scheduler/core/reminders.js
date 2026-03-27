import { getState } from "./store.js";

const fired = new Set();

function notify(text) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(text);
    return;
  }
  const node = document.createElement("div");
  node.className = "x-item";
  node.textContent = text;
  document.body.append(node);
  setTimeout(() => node.remove(), 5000);
}

export function startReminderLoop() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }

  setInterval(() => {
    const now = Date.now();
    for (const block of getState().blocks) {
      const start = new Date(block.start_at).getTime();
      if (Number.isNaN(start)) continue;
      const key = `${block.id || block.task_id}-${block.start_at}`;
      if (fired.has(key)) continue;
      if (start - now < 60 * 1000 && start - now > -30 * 1000) {
        fired.add(key);
        notify(`Start now: ${block.title}`);
      }
    }
  }, 30000);
}

