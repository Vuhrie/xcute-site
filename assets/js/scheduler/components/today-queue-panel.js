import { queueAckBreak, queueComplete, queuePause, queueSkip, queueStart, refreshTodayQueue } from "../core/actions.js";
import { getState, subscribe } from "../core/store.js";

const template = document.createElement("template");
template.innerHTML = `
  <section class="x-panel x-queue-panel">
    <div class="x-inline x-space-between">
      <h3>Today Queue</h3>
      <p class="x-small" data-role="date"></p>
    </div>
    <div class="x-queue-now" data-role="now">
      <strong data-role="now-title">No active task yet.</strong>
      <div class="x-inline x-space-between">
        <span class="x-small" data-role="countdown">--:--</span>
        <span class="x-small" data-role="meta">Start to begin</span>
      </div>
      <div class="x-small" data-role="progress-text">Progress: --</div>
      <div class="x-progress">
        <div class="x-progress__bar" data-role="bar"></div>
      </div>
    </div>
    <div class="x-inline">
      <button class="c-btn" data-action="start">Start</button>
      <button class="c-btn c-btn--muted" data-action="pause">Pause</button>
      <button class="c-btn c-btn--muted" data-action="skip">Skip</button>
      <button class="c-btn" data-action="complete">Complete</button>
      <button class="c-btn c-btn--muted" data-action="ack-break">Continue After Break</button>
    </div>
    <div class="x-list" data-role="queue"></div>
    <p class="x-small" data-role="status"></p>
  </section>
`;

function formatClock(totalSec) {
  const safe = Math.max(0, Number.parseInt(totalSec, 10) || 0);
  const min = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const sec = (safe % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function serverRemaining(session) {
  if (!session) return 0;
  const remaining = Math.max(0, Number.parseFloat(session.remaining_sec) || 0);
  if (Number.parseInt(session.running, 10) !== 1 || !session.started_at) return remaining;
  const startMs = Date.parse(session.started_at);
  if (Number.isNaN(startMs)) return remaining;
  const elapsed = Math.max(0, (Date.now() - startMs) / 1000);
  return Math.max(0, remaining - elapsed);
}

function clampRatio(ratio) {
  return Math.min(1, Math.max(0, ratio));
}

function queueRow(item, { activeEntryId, mode, running, remainingLookup }) {
  const active = item.entry_id === activeEntryId && mode === "task";
  const itemClass = active ? "x-item is-active" : "x-item";
  const status = active ? (running ? "running" : "paused") : item.status;
  const planned = Math.max(1, Number.parseFloat(item.planned_sec) || 1);
  const remaining = active ? Math.max(0, remainingLookup) : Math.max(0, Number.parseFloat(item.remaining_sec) || planned);
  const ratio = clampRatio(1 - remaining / planned);
  return `<article class="${itemClass}">
    <div class="x-inline x-space-between">
      <div>
        <strong>${item.title}</strong>
        <div class="x-small">${item.goal_title} | ${Math.max(1, Math.round((item.minutes_allocated || 0) * 10) / 10)}m | ${status}</div>
      </div>
      <button class="c-btn c-btn--muted" data-action="start-entry" data-id="${item.entry_id}">Play</button>
    </div>
    <div class="x-progress x-progress--mini">
      <div class="x-progress__bar ${active && running ? "is-running" : ""} ${active && !running ? "is-paused" : ""}" style="transform: scaleX(${ratio})"></div>
    </div>
  </article>`;
}

export class TodayQueuePanel extends HTMLElement {
  connectedCallback() {
    this.append(template.content.cloneNode(true));
    this.dateNode = this.querySelector('[data-role="date"]');
    this.nowTitleNode = this.querySelector('[data-role="now-title"]');
    this.countdownNode = this.querySelector('[data-role="countdown"]');
    this.metaNode = this.querySelector('[data-role="meta"]');
    this.progressTextNode = this.querySelector('[data-role="progress-text"]');
    this.barNode = this.querySelector('[data-role="bar"]');
    this.queueNode = this.querySelector('[data-role="queue"]');
    this.statusNode = this.querySelector('[data-role="status"]');
    this.localClock = null;
    this.lastStateKey = "";
    this.addEventListener("click", (event) => this.onClick(event));
    this.unsubscribe = subscribe(() => this.render());
    this.render();
    this.tick = setInterval(() => {
      this.tickLocalClock();
      this.renderNowOnly();
    }, 200);
    this.sync = setInterval(() => refreshTodayQueue().catch(() => {}), 6000);
  }

  disconnectedCallback() {
    this.unsubscribe?.();
    clearInterval(this.tick);
    clearInterval(this.sync);
  }

  getCurrentState() {
    const { queueItems, queueSession } = getState();
    const session = queueSession || null;
    const activeTask = queueItems.find((item) => item.entry_id === session?.active_entry_id) || null;
    return { queueItems, session, activeTask };
  }

  stateKey(session, activeTask) {
    if (!session) return "none";
    const activeId = activeTask?.entry_id || "none";
    return `${session.mode}:${activeId}:${Number.parseInt(session.running, 10) === 1 ? "1" : "0"}`;
  }

  syncLocalClockFromState(immediate = false) {
    const { session, activeTask } = this.getCurrentState();
    if (!session) {
      this.localClock = null;
      return;
    }

    const isBreak = session.mode === "break";
    const key = isBreak ? "break" : activeTask?.entry_id || "none";
    if (!isBreak && !activeTask) {
      this.localClock = null;
      return;
    }

    const totalSec = Math.max(
      1,
      Number.parseFloat(isBreak ? session.break_sec : activeTask?.planned_sec || activeTask?.minutes_allocated * 60 || 60) || 1
    );
    const serverRem = serverRemaining(session);
    const running = Number.parseInt(session.running, 10) === 1;

    if (!this.localClock || immediate || this.localClock.key !== key || this.localClock.mode !== session.mode) {
      this.localClock = {
        key,
        mode: session.mode,
        running,
        remainingSec: serverRem,
        totalSec,
        correctionSec: 0,
        lastTs: performance.now(),
      };
      return;
    }

    this.localClock.running = running;
    this.localClock.totalSec = totalSec;
    this.localClock.correctionSec = serverRem - this.localClock.remainingSec;
    this.localClock.lastTs = performance.now();
  }

  tickLocalClock() {
    if (!this.localClock) return;

    const now = performance.now();
    const elapsedSec = Math.max(0, (now - this.localClock.lastTs) / 1000);
    this.localClock.lastTs = now;

    if (this.localClock.running) {
      this.localClock.remainingSec = Math.max(0, this.localClock.remainingSec - elapsedSec);
    }

    if (Math.abs(this.localClock.correctionSec) > 0.01) {
      const step = Math.sign(this.localClock.correctionSec) * Math.min(Math.abs(this.localClock.correctionSec), elapsedSec * 1.5);
      this.localClock.remainingSec = Math.max(0, this.localClock.remainingSec + step);
      this.localClock.correctionSec -= step;
    }
  }

  optimisticStart(entryId = "") {
    const { queueItems, session } = this.getCurrentState();

    if (session?.mode === "break") {
      this.syncLocalClockFromState(true);
      if (this.localClock) this.localClock.running = true;
      return;
    }

    const chosen =
      queueItems.find((item) => item.entry_id === entryId) ||
      queueItems.find((item) => item.entry_id === session?.active_entry_id) ||
      queueItems.find((item) => item.status !== "done") ||
      null;

    if (!chosen) return;

    const planned = Math.max(1, Number.parseFloat(chosen.planned_sec) || Number.parseFloat(chosen.minutes_allocated) * 60 || 60);
    const remaining = Math.max(0, Number.parseFloat(chosen.remaining_sec) || planned);
    this.localClock = {
      key: chosen.entry_id,
      mode: "task",
      running: true,
      remainingSec: remaining,
      totalSec: planned,
      correctionSec: 0,
      lastTs: performance.now(),
    };
  }

  async onClick(event) {
    const action = event.target?.dataset?.action;
    if (!action) return;
    event.preventDefault();

    try {
      if (action === "start") {
        this.optimisticStart();
        this.renderNowOnly();
        await queueStart();
        this.syncLocalClockFromState(true);
        this.statusNode.textContent = "Queue started.";
        return;
      }

      if (action === "pause") {
        if (this.localClock) this.localClock.running = false;
        this.renderNowOnly();
        await queuePause();
        this.syncLocalClockFromState(true);
        this.statusNode.textContent = "Queue paused.";
        return;
      }

      if (action === "skip") {
        await queueSkip();
        this.syncLocalClockFromState(true);
        this.statusNode.textContent = "Moved current task to queue end.";
        return;
      }

      if (action === "complete") {
        await queueComplete();
        this.syncLocalClockFromState(true);
        this.statusNode.textContent = "Task slice completed.";
        return;
      }

      if (action === "ack-break") {
        await queueAckBreak();
        this.syncLocalClockFromState(true);
        this.statusNode.textContent = "Break acknowledged. Start when ready.";
        return;
      }

      if (action === "start-entry") {
        const id = String(event.target.dataset.id || "");
        if (!id) return;
        this.optimisticStart(id);
        this.renderNowOnly();
        await queueStart(id);
        this.syncLocalClockFromState(true);
        this.statusNode.textContent = "Queue started from selected task.";
      }
    } catch (error) {
      this.statusNode.textContent = `Error: ${error.message}`;
    }
  }

  renderNowOnly() {
    const { session, activeTask } = this.getCurrentState();
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const local = this.localClock;

    if (!session) {
      this.nowTitleNode.textContent = "No active task yet.";
      this.countdownNode.textContent = "--:--";
      this.metaNode.textContent = "Start to begin";
      this.progressTextNode.textContent = "Progress: --";
      this.barNode.style.transform = "scaleX(0)";
      this.barNode.classList.remove("is-running", "is-paused");
      return;
    }

    if (session.mode === "break") {
      const remaining = Math.max(0, local?.remainingSec ?? serverRemaining(session));
      const total = Math.max(1, Number.parseFloat(session.break_sec) || 1);
      const ratio = clampRatio(1 - remaining / total);
      this.nowTitleNode.textContent = "Break Time";
      this.countdownNode.textContent = formatClock(remaining);
      this.metaNode.textContent = remaining > 0 ? "Auto-running break" : "Break finished. Tap Continue.";
      this.progressTextNode.textContent = `Progress: ${Math.round(ratio * 100)}%`;
      this.barNode.style.transform = `scaleX(${ratio})`;
      this.barNode.classList.toggle("is-running", !reduceMotion && Number.parseInt(session.running, 10) === 1);
      this.barNode.classList.toggle("is-paused", Number.parseInt(session.running, 10) !== 1);
      return;
    }

    if (!activeTask) {
      this.nowTitleNode.textContent = "No active task yet.";
      this.countdownNode.textContent = "--:--";
      this.metaNode.textContent = "Start to begin";
      this.progressTextNode.textContent = "Progress: --";
      this.barNode.style.transform = "scaleX(0)";
      this.barNode.classList.remove("is-running", "is-paused");
      return;
    }

    const remaining = Math.max(0, local?.remainingSec ?? serverRemaining(session));
    const total = Math.max(1, local?.totalSec || Number.parseFloat(activeTask.planned_sec) || 1);
    const ratio = clampRatio(1 - remaining / total);
    const elapsed = Math.max(0, total - remaining);
    const running = local ? local.running : Number.parseInt(session.running, 10) === 1;

    this.nowTitleNode.textContent = activeTask.title;
    this.countdownNode.textContent = formatClock(remaining);
    this.metaNode.textContent = `${activeTask.goal_title} | ${running ? "Running" : "Paused"}`;
    this.progressTextNode.textContent = `Progress: ${formatClock(elapsed)} / ${formatClock(total)} (${Math.round(ratio * 100)}%)`;
    this.barNode.style.transform = `scaleX(${ratio})`;
    this.barNode.classList.toggle("is-running", !reduceMotion && running);
    this.barNode.classList.toggle("is-paused", !running);
  }

  render() {
    const { queueDate, queueItems, queueSession } = getState();
    this.dateNode.textContent = queueDate || "";

    const currentKey = this.stateKey(queueSession, queueItems.find((item) => item.entry_id === queueSession?.active_entry_id));
    const immediate = currentKey !== this.lastStateKey;
    this.lastStateKey = currentKey;
    this.syncLocalClockFromState(immediate);

    if (!queueItems.length) {
      this.queueNode.innerHTML = `<article class="x-item x-small">No tasks planned for today yet.</article>`;
    } else {
      const remainingLookup = this.localClock?.remainingSec || 0;
      this.queueNode.innerHTML = queueItems
        .map((item) =>
          queueRow(item, {
            activeEntryId: queueSession?.active_entry_id,
            mode: queueSession?.mode,
            running: this.localClock ? this.localClock.running : Number.parseInt(queueSession?.running, 10) === 1,
            remainingLookup,
          })
        )
        .join("");
    }

    this.renderNowOnly();
  }
}

customElements.define("today-queue-panel", TodayQueuePanel);
