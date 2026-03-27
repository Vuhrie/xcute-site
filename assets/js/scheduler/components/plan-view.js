import { getState, subscribe } from "../core/store.js";
import { animatePanel, animateRows } from "../core/motion.js";

const template = document.createElement("template");
template.innerHTML = `
  <section class="x-panel x-plan-panel">
    <h3>Full Timeline</h3>
    <p class="x-small">All planned tasks by date, across goals.</p>
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

function goalBadge(goal) {
  const total = Number.parseInt(goal.total_min, 10) || 0;
  const done = Number.parseInt(goal.completed_min, 10) || 0;
  const ratio = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
  const targetLabel = goal.target_date || "Daily";
  return `<article class="x-goal-badge x-goal-badge-row">
    <strong>${goal.title}</strong>
    <div class="x-small">Target: ${targetLabel} | ${done}/${total} min</div>
    <div class="x-progress"><div class="x-progress__bar" style="transform: scaleX(${ratio})"></div></div>
  </article>`;
}

function byDateThenOrder(a, b) {
  if (a.date !== b.date) return String(a.date).localeCompare(String(b.date));
  if ((a.order_index || 0) !== (b.order_index || 0)) return (a.order_index || 0) - (b.order_index || 0);
  return String(a.entry_id || "").localeCompare(String(b.entry_id || ""));
}

export class PlanView extends HTMLElement {
  connectedCallback() {
    this.append(template.content.cloneNode(true));
    this.badgesNode = this.querySelector('[data-role="goal-badges"]');
    this.timelineNode = this.querySelector('[data-role="timeline"]');
    animatePanel(this.querySelector(".x-panel"));
    this.unsubscribe = subscribe(() => this.render());
    this.render();
  }

  disconnectedCallback() {
    this.unsubscribe?.();
  }

  render() {
    const goals = getState().timelineGoals || [];
    const items = [...(getState().timelineItems || [])].sort(byDateThenOrder);

    if (!goals.length) {
      this.badgesNode.innerHTML = `<article class="x-item x-small">No scheduled goals yet.</article>`;
    } else {
      this.badgesNode.innerHTML = goals.map((goal) => goalBadge(goal)).join("");
      animateRows(this.badgesNode, ".x-goal-badge-row", 32);
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
    animateRows(this.timelineNode, ".x-timeline-entry", 26);
  }
}

customElements.define("plan-view", PlanView);
