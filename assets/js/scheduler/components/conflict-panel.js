import { getState, subscribe } from "../core/store.js";

const template = document.createElement("template");
template.innerHTML = `
  <section class="x-panel">
    <h3>Deferred / Conflicts</h3>
    <div class="x-list" data-role="list"></div>
  </section>
`;

export class ConflictPanel extends HTMLElement {
  connectedCallback() {
    this.append(template.content.cloneNode(true));
    this.list = this.querySelector('[data-role="list"]');
    this.unsubscribe = subscribe(() => this.render());
    this.render();
  }

  disconnectedCallback() {
    this.unsubscribe?.();
  }

  render() {
    const deferred = getState().deferred || [];
    if (!deferred.length) {
      this.list.innerHTML = `<article class="x-item x-small">No conflicts. Great pacing.</article>`;
      return;
    }
    this.list.innerHTML = deferred
      .map(
        (item) => `<article class="x-item">
          <strong>${item.title || item.task_id}</strong>
          <div class="x-small">Reason: ${item.reason || "capacity"}</div>
        </article>`
      )
      .join("");
  }
}

customElements.define("conflict-panel", ConflictPanel);

