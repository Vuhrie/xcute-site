import { getState, setWriteKey, subscribe } from "../core/store.js";

const template = document.createElement("template");
template.innerHTML = `
  <section class="x-panel">
    <h3>Write Key</h3>
    <p class="x-small">Required for adding/editing goals, tasks, and plans.</p>
    <div class="x-inline">
      <input class="x-grow" type="password" name="write_key" placeholder="Paste your WRITE_API_KEY" autocomplete="off" />
      <button class="c-btn" data-action="save">Save Key</button>
      <button class="c-btn c-btn--muted" data-action="clear">Clear</button>
    </div>
    <p class="x-small" data-role="status"></p>
  </section>
`;

export class WriteKeyPanel extends HTMLElement {
  connectedCallback() {
    this.append(template.content.cloneNode(true));
    this.input = this.querySelector('input[name="write_key"]');
    this.status = this.querySelector('[data-role="status"]');
    this.addEventListener("click", (event) => this.onClick(event));
    this.unsubscribe = subscribe(() => this.render());
    this.render();
  }

  disconnectedCallback() {
    this.unsubscribe?.();
  }

  onClick(event) {
    const action = event.target?.dataset?.action;
    if (!action) return;
    event.preventDefault();

    if (action === "save") {
      setWriteKey(this.input.value);
      this.status.textContent = getState().writeKey ? "Write key saved in this browser." : "Key is empty.";
      return;
    }

    if (action === "clear") {
      setWriteKey("");
      this.input.value = "";
      this.status.textContent = "Write key cleared.";
    }
  }

  render() {
    const hasKey = Boolean(getState().writeKey);
    if (!this.input.matches(":focus")) {
      this.input.value = getState().writeKey;
    }
    if (!this.status.textContent) {
      this.status.textContent = hasKey ? "Write key is configured." : "No write key set yet.";
    }
  }
}

customElements.define("write-key-panel", WriteKeyPanel);
