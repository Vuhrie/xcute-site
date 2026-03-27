import { getState, subscribe } from "../core/store.js";

const template = document.createElement("template");
template.innerHTML = `
  <section class="x-panel">
    <h3>Planned Dates</h3>
    <div class="x-list" data-role="schedule"></div>
    <div class="x-list" data-role="overflow"></div>
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

export class PlanView extends HTMLElement {
  connectedCallback() {
    this.append(template.content.cloneNode(true));
    this.scheduleNode = this.querySelector('[data-role="schedule"]');
    this.overflowNode = this.querySelector('[data-role="overflow"]');
    this.unsubscribe = subscribe(() => this.render());
    this.render();
  }

  disconnectedCallback() {
    this.unsubscribe?.();
  }

  render() {
    const grouped = new Map();
    for (const item of getState().schedule || []) {
      if (!grouped.has(item.date)) grouped.set(item.date, []);
      grouped.get(item.date).push(item);
    }

    if (!grouped.size) {
      this.scheduleNode.innerHTML = `<article class="x-item x-small">No plan yet. Run "Generate Plan".</article>`;
    } else {
      this.scheduleNode.innerHTML = [...grouped.entries()]
        .map(([date, rows]) => {
          const total = rows.reduce((sum, row) => sum + (Number.parseInt(row.minutes_allocated, 10) || 0), 0);
          const items = rows
            .map(
              (row) =>
                `<div class="x-small">${row.display_title || row.title || row.task_title || "Task"}: ${formatMinutes(
                  row.minutes_allocated
                )}</div>`
            )
            .join("");
          return `<article class="x-item">
            <strong>${date}</strong>
            <div class="x-small">Total: ${formatMinutes(total)}</div>
            ${items}
          </article>`;
        })
        .join("");
    }

    const overflow = getState().overflow || [];
    if (!overflow.length) {
      this.overflowNode.innerHTML = "";
      return;
    }

    this.overflowNode.innerHTML = `
      <article class="x-item">
        <strong>Unallocated (past target date)</strong>
        ${overflow
          .map((item) => `<div class="x-small">${item.title}: ${formatMinutes(item.remaining_min)}</div>`)
          .join("")}
      </article>
    `;
  }
}

customElements.define("plan-view", PlanView);
