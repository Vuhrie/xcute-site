import { animatePanel, animateRows } from "../core/motion.js";
import { getState, subscribeSelector } from "../core/store.js";

const template = document.createElement("template");
template.innerHTML = `
  <section class="x-panel x-plan-panel">
    <h3>Full Timeline (30 Days)</h3>
    <p class="x-small">All planned slices by date, across goals, including unscheduled conflicts.</p>
    <div class="x-list" data-role="unscheduled"></div>
    <div class="x-goal-badges" data-role="goal-badges"></div>
    <div class="x-list" data-role="timeline"></div>
  </section>
`;

function formatMinutes(value) {
  const minutes = Number.parseInt(value, 10) || 0;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

function capitalize(value) {
  const text = String(value || "");
  return text ? `${text.slice(0, 1).toUpperCase()}${text.slice(1)}` : "";
}

function goalBadge(goal) {
  const total = Number.parseInt(goal.total_min, 10) || 0;
  const done = Number.parseInt(goal.completed_min, 10) || 0;
  const ratio = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
  const targetLabel = goal.target_date || "Daily";
  return `<article class="x-goal-badge x-goal-badge-row">
    <strong>${goal.title}</strong>
    <div class="x-small">Target: ${targetLabel} | ${done}/${total} min | ${capitalize(goal.weight_level || "medium")}</div>
    <div class="x-progress"><div class="x-progress__bar" style="transform: scaleX(${ratio})"></div></div>
  </article>`;
}

function byDateThenOrder(a, b) {
  if (a.date !== b.date) return String(a.date).localeCompare(String(b.date));
  if ((a.order_index || 0) !== (b.order_index || 0)) return (a.order_index || 0) - (b.order_index || 0);
  return String(a.entry_id || "").localeCompare(String(b.entry_id || ""));
}

function goalsSig(goals) {
  if (!Array.isArray(goals) || !goals.length) return "none";
  return goals
    .map(
      (goal) =>
        `${goal.id || ""}:${goal.title || ""}:${goal.target_date || ""}:${goal.total_min || 0}:${goal.completed_min || 0}:${
          goal.weight_level || "medium"
        }`
    )
    .join("|");
}

function timelineSig(items) {
  if (!Array.isArray(items) || !items.length) return "none";
  return items
    .map(
      (item) =>
        `${item.entry_id || ""}:${item.date || ""}:${item.order_index || 0}:${item.goal_title || ""}:${item.title || ""}:${
          item.minutes_allocated || 0
        }:${item.entry_done ? 1 : 0}`
    )
    .join("|");
}

function unscheduledSig(items) {
  if (!Array.isArray(items) || !items.length) return "none";
  return items
    .map((item) => `${item.id || ""}:${item.date || ""}:${item.goal_id || ""}:${item.title || ""}:${item.remaining_min || 0}:${item.reason || ""}`)
    .join("|");
}

function selectTimelineSlice(state) {
  return {
    timelineGoals: state.timelineGoals || [],
    timelineItems: state.timelineItems || [],
    unscheduledItems: state.unscheduledItems || [],
    goalsSig: goalsSig(state.timelineGoals),
    itemsSig: timelineSig(state.timelineItems),
    unscheduledItemsSig: unscheduledSig(state.unscheduledItems),
  };
}

function sameTimelineSlice(a, b) {
  if (!a || !b) return false;
  return a.goalsSig === b.goalsSig && a.itemsSig === b.itemsSig && a.unscheduledItemsSig === b.unscheduledItemsSig;
}

export class PlanView extends HTMLElement {
  connectedCallback() {
    this.append(template.content.cloneNode(true));
    this.unscheduledNode = this.querySelector('[data-role="unscheduled"]');
    this.badgesNode = this.querySelector('[data-role="goal-badges"]');
    this.timelineNode = this.querySelector('[data-role="timeline"]');
    animatePanel(this.querySelector(".x-panel"));
    this.slice = selectTimelineSlice(getState());
    this.unsubscribe = subscribeSelector(
      selectTimelineSlice,
      (nextSlice) => {
        this.slice = nextSlice;
        this.render(nextSlice);
      },
      sameTimelineSlice
    );
    this.render(this.slice);
  }

  disconnectedCallback() {
    this.unsubscribe?.();
  }

  renderUnscheduled(items) {
    if (!items.length) {
      this.unscheduledNode.innerHTML = "";
      return;
    }

    const rows = items
      .map((item) => {
        const reason = item.reason === "deadline_blocked" ? "deadline blocked" : item.reason || "unscheduled";
        return `<article class="x-item x-unscheduled-row">
          <strong>${item.title || "Task"}</strong>
          <div class="x-small">${item.date} | ${formatMinutes(item.remaining_min)} | ${reason}</div>
        </article>`;
      })
      .join("");

    this.unscheduledNode.innerHTML = `
      <article class="x-item x-unscheduled-wrap">
        <strong>Unscheduled Conflicts</strong>
        <div class="x-list">${rows}</div>
      </article>
    `;
  }

  render(slice = this.slice || selectTimelineSlice(getState())) {
    const goals = slice.timelineGoals || [];
    const items = [...(slice.timelineItems || [])].sort(byDateThenOrder);
    const unscheduledItems = slice.unscheduledItems || [];

    this.renderUnscheduled(unscheduledItems);

    if (!goals.length) {
      this.badgesNode.innerHTML = `<article class="x-item x-small">No scheduled goals yet.</article>`;
    } else {
      this.badgesNode.innerHTML = goals.map((goal) => goalBadge(goal)).join("");
      animateRows(this.badgesNode, ".x-goal-badge-row", 0);
    }

    const grouped = new Map();
    for (const item of items) {
      if (!grouped.has(item.date)) grouped.set(item.date, []);
      grouped.get(item.date).push(item);
    }

    if (!grouped.size) {
      this.timelineNode.innerHTML = `<article class="x-item x-small">No timeline yet. Generate a plan for any goal.</article>`;
      return;
    }

    this.timelineNode.innerHTML = [...grouped.entries()]
      .map(([date, rows]) => {
        const total = rows.reduce((sum, row) => sum + (Number.parseInt(row.minutes_allocated, 10) || 0), 0);
        const content = rows
          .map((row) => {
            const done = row.entry_done ? "is-done" : "";
            return `<div class="x-timeline-row x-timeline-entry ${done}">
              <span class="x-chip">${row.goal_title}</span>
              <span class="x-timeline-title">${row.title || "Task"}</span>
              <span class="x-small">${formatMinutes(row.minutes_allocated)}</span>
            </div>`;
          })
          .join("");

        return `<article class="x-item x-timeline-day">
          <div class="x-inline x-space-between">
            <strong>${date}</strong>
            <span class="x-small">Total: ${formatMinutes(total)}</span>
          </div>
          ${content}
        </article>`;
      })
      .join("");
    animateRows(this.timelineNode, ".x-timeline-entry", 0);
  }
}

customElements.define("plan-view", PlanView);
