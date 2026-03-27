import { queueAckBreak, queueComplete, queuePause, queueSkip, queueStart, refreshTodayQueue } from "../core/actions.js";
import { toUiError } from "../core/api.js";
import { animatePanel, animateRows, animateStateBump } from "../core/motion.js";
import { getState, subscribeSelector } from "../core/store.js";

const template = document.createElement("template");
template.innerHTML = `
  <section class="x-panel x-queue-panel" data-animate="fade-up" data-motion-role="panel" data-reveal-start="0.84" data-reveal-threshold="0.3">
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
      <p class="x-small" data-role="progress-text">Progress: --</p>
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

function queueRow(item, activeEntryId, mode, running) {
  const active = item.entry_id === activeEntryId && mode === "task";
  const itemClass = active ? "x-item is-active" : "x-item";
  const status = active ? (running ? "running" : "paused") : item.status;
  return `<article class="${itemClass} x-queue-item">
    <div class="x-inline x-space-between">
      <div>
        <strong>${item.title}</strong>
        <div class="x-small">${item.goal_title} | ${Math.max(1, Math.round((item.minutes_allocated || 0) * 10) / 10)}m | ${status}</div>
      </div>
      <button class="c-btn c-btn--muted" data-action="start-entry" data-id="${item.entry_id}">Play</button>
    </div>
  </article>`;
}

function queueItemsSig(items) {
  if (!Array.isArray(items) || !items.length) return "none";
  return items
    .map(
      (item) =>
        `${item.entry_id || ""}:${item.order_index || 0}:${item.status || ""}:${item.title || ""}:${item.minutes_allocated || 0}`
    )
    .join("|");
}

function queueSessionSig(session) {
  if (!session) return "none";
  return `${session.mode || "task"}:${session.active_entry_id || ""}:${Number.parseInt(session.running, 10) || 0}:${
    session.state_version || 0
  }`;
}

function selectQueueSlice(state) {
  return {
    queueDate: state.queueDate || "",
    queueItems: state.queueItems || [],
    queueSession: state.queueSession || null,
    itemsSig: queueItemsSig(state.queueItems),
    sessionSig: queueSessionSig(state.queueSession),
  };
}

function sameQueueSlice(a, b) {
  if (!a || !b) return false;
  return a.queueDate === b.queueDate && a.itemsSig === b.itemsSig && a.sessionSig === b.sessionSig;
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
    this.skipButton = this.querySelector('[data-action="skip"]');
    this.nowNode = this.querySelector('[data-role="now"]');
    animatePanel(this.querySelector(".x-panel"));
    this.localClock = null;
    this.slice = selectQueueSlice(getState());
    this.lastQueueSig = "";
    this.lastSessionSig = "";
    this.addEventListener("click", (event) => this.onClick(event));
    this.unsubscribe = subscribeSelector(
      selectQueueSlice,
      (nextSlice) => {
        this.slice = nextSlice;
        this.render(nextSlice);
      },
      sameQueueSlice
    );
    this.render(this.slice);
    this.tick = setInterval(() => this.renderNowOnly(), 250);
    this.sync = setInterval(() => refreshTodayQueue().catch(() => {}), 8000);
  }

  disconnectedCallback() {
    this.unsubscribe?.();
    clearInterval(this.tick);
    clearInterval(this.sync);
  }

  setStatus(message) {
    this.statusNode.textContent = message;
  }

  sessionKey(session) {
    if (!session) return "";
    return `${session.mode || "task"}:${session.active_entry_id || "none"}:${session.state_version || 0}`;
  }

  currentRemaining(session) {
    const key = this.sessionKey(session);
    if (!session) {
      this.localClock = null;
      return 0;
    }

    const serverRemaining = Math.max(0, Number.parseInt(session.remaining_sec, 10) || 0);
    const running = Number.parseInt(session.running, 10) === 1;
    const now = Date.now();

    if (!this.localClock || this.localClock.key !== key) {
      this.localClock = { key, running, anchorMs: now, anchorRemaining: serverRemaining };
      return serverRemaining;
    }

    if (!running) {
      this.localClock = { key, running, anchorMs: now, anchorRemaining: serverRemaining };
      return serverRemaining;
    }

    const elapsed = Math.floor((now - this.localClock.anchorMs) / 1000);
    const localRemaining = Math.max(0, this.localClock.anchorRemaining - elapsed);
    const corrected = Math.min(localRemaining, serverRemaining);
    if (corrected !== localRemaining) {
      this.localClock = { key, running, anchorMs: now, anchorRemaining: corrected };
    }
    return corrected;
  }

  async onClick(event) {
    const action = event.target?.dataset?.action;
    if (!action) return;
    event.preventDefault();

    const session = this.slice?.queueSession || null;

    try {
      if (action === "start") {
        await queueStart();
        this.setStatus("Queue started.");
        animateStateBump(this.nowNode);
        return;
      }

      if (action === "pause") {
        await queuePause();
        this.setStatus("Queue paused.");
        animateStateBump(this.nowNode);
        return;
      }

      if (action === "skip") {
        if (session?.mode === "break") {
          const approved = window.confirm("Skip remaining break and move on to the next task?");
          if (!approved) return;
          await queueAckBreak(true);
          this.setStatus("Break skipped. Next task is ready.");
          animateStateBump(this.nowNode);
          return;
        }

        await queueSkip();
        this.setStatus("Moved current task to queue end.");
        animateStateBump(this.nowNode);
        return;
      }

      if (action === "complete") {
        await queueComplete();
        this.setStatus("Task slice completed.");
        animateStateBump(this.nowNode);
        return;
      }

      if (action === "ack-break") {
        await queueAckBreak(false);
        this.setStatus("Break acknowledged. Start when ready.");
        animateStateBump(this.nowNode);
        return;
      }

      if (action === "start-entry") {
        const id = String(event.target.dataset.id || "");
        if (!id) return;
        await queueStart(id);
        this.setStatus("Queue started from selected task.");
        animateStateBump(this.nowNode);
      }
    } catch (error) {
      this.setStatus(`Error: ${toUiError(error)}`);
    }
  }

  renderNowOnly() {
    const queueItems = this.slice?.queueItems || [];
    const session = this.slice?.queueSession || null;
    const activeTask = queueItems.find((item) => item.entry_id === session?.active_entry_id) || null;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    this.skipButton.textContent = session?.mode === "break" ? "Skip Break" : "Skip";

    if (!session || !activeTask) {
      if (session?.mode === "break") {
        const rem = this.currentRemaining(session);
        this.nowTitleNode.textContent = "Break Time";
        this.countdownNode.textContent = formatClock(rem);
        this.metaNode.textContent = rem > 0 ? "Auto-running break" : "Break finished. Tap Continue.";
        const total = Math.max(1, Number.parseInt(session.break_sec, 10) || 1);
        const ratio = Math.min(1, Math.max(0, 1 - rem / total));
        this.progressTextNode.textContent = `Progress: ${Math.round(ratio * 100)}%`;
        this.barNode.style.transform = `scaleX(${ratio})`;
        if (!reduceMotion) this.barNode.classList.add("is-running");
        else this.barNode.classList.remove("is-running");
        this.barNode.classList.remove("is-paused");
        return;
      }

      this.nowTitleNode.textContent = "No active task yet.";
      this.countdownNode.textContent = "--:--";
      this.metaNode.textContent = "Start to begin";
      this.progressTextNode.textContent = "Progress: --";
      this.barNode.style.transform = "scaleX(0)";
      this.barNode.classList.remove("is-running", "is-paused");
      return;
    }

    const rem = this.currentRemaining(session);
    const total = Math.max(1, Number.parseInt(activeTask.planned_sec, 10) || 1);
    const elapsed = Math.max(0, total - rem);
    const ratio = Math.min(1, Math.max(0, elapsed / total));
    this.nowTitleNode.textContent = activeTask.title;
    this.countdownNode.textContent = formatClock(rem);
    this.metaNode.textContent = `${activeTask.goal_title} | ${session.running ? "Running" : "Paused"}`;
    this.progressTextNode.textContent = `${formatClock(elapsed)} / ${formatClock(total)} (${Math.round(ratio * 100)}%)`;
    this.barNode.style.transform = `scaleX(${ratio})`;

    if (session.running && !reduceMotion) {
      this.barNode.classList.add("is-running");
      this.barNode.classList.remove("is-paused");
    } else {
      this.barNode.classList.remove("is-running");
      if (session.mode === "task" && rem > 0) this.barNode.classList.add("is-paused");
      else this.barNode.classList.remove("is-paused");
    }
  }

  render(slice = this.slice || selectQueueSlice(getState())) {
    this.dateNode.textContent = slice.queueDate || "";

    if (this.lastQueueSig !== slice.itemsSig || this.lastSessionSig !== slice.sessionSig) {
      if (!slice.queueItems.length) {
        this.queueNode.innerHTML = `<article class="x-item x-small">No tasks planned for today yet.</article>`;
      } else {
        this.queueNode.innerHTML = slice.queueItems
          .map((item) =>
            queueRow(
              item,
              slice.queueSession?.active_entry_id,
              slice.queueSession?.mode,
              Number.parseInt(slice.queueSession?.running, 10) === 1
            )
          )
          .join("");
      }
      animateRows(this.queueNode, ".x-queue-item", 34);
      this.lastQueueSig = slice.itemsSig;
      this.lastSessionSig = slice.sessionSig;
    }

    this.renderNowOnly();
  }
}

customElements.define("today-queue-panel", TodayQueuePanel);
