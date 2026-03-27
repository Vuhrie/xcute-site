import { api } from "../core/api.js";
import { getState, subscribe } from "../core/store.js";

const template = document.createElement("template");
template.innerHTML = `
  <section class="x-panel">
    <h3>Timeline</h3>
    <div class="x-list" data-role="list"></div>
  </section>
`;

function timeLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export class TimelineView extends HTMLElement {
  connectedCallback() {
    this.append(template.content.cloneNode(true));
    this.list = this.querySelector('[data-role="list"]');
    this.addEventListener("click", (event) => this.onClick(event));
    this.unsubscribe = subscribe(() => this.render());
    this.render();
  }

  disconnectedCallback() {
    this.unsubscribe?.();
  }

  async onClick(event) {
    const action = event.target?.dataset?.action;
    const id = event.target?.dataset?.id;
    if (!action || !id || !getState().token) return;
    event.preventDefault();
    if (action === "lock") {
      await api.lockBlock(id, event.target.dataset.value === "1");
      this.dispatchEvent(new CustomEvent("data-refresh", { bubbles: true }));
    }
    if (action === "complete") {
      await api.completeBlock(id, event.target.dataset.value === "1");
      this.dispatchEvent(new CustomEvent("data-refresh", { bubbles: true }));
    }
  }

  render() {
    const blocks = getState().blocks || [];
    if (!blocks.length) {
      this.list.innerHTML = `<article class="x-item x-small">No blocks scheduled yet.</article>`;
      return;
    }
    this.list.innerHTML = blocks
      .map((block) => {
        const locked = Number(block.locked) === 1;
        const completed = Number(block.completed) === 1;
        return `<article class="x-item x-timeline-item">
          <strong>${timeLabel(block.start_at)} - ${timeLabel(block.end_at)}</strong>
          <div>${block.title}</div>
          <div class="x-small">Source: ${block.source || "auto"} | Score: ${block.score || 0}</div>
          <div class="x-inline">
            <button class="c-btn" data-action="lock" data-id="${block.id}" data-value="${locked ? 0 : 1}">
              ${locked ? "Unlock" : "Lock"}
            </button>
            <button class="c-btn" data-action="complete" data-id="${block.id}" data-value="${completed ? 0 : 1}">
              ${completed ? "Uncomplete" : "Complete"}
            </button>
          </div>
        </article>`;
      })
      .join("");
  }
}

customElements.define("timeline-view", TimelineView);

