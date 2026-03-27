import { getState, setState, setWriteKey, subscribe } from "../core/store.js";
import { animatePanel, animateStateBump } from "../core/motion.js";

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
    this.panel = this.querySelector(".x-panel");
    animatePanel(this.panel);
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
      const hasKey = Boolean(getState().writeKey);
      setState({ writeKeyWarning: hasKey ? "" : "Write key missing or incorrect. Update it and click Save Key." });
      this.status.textContent = hasKey ? "Write key saved in this browser." : "Key is empty.";
      animateStateBump(this.panel);
      return;
    }

    if (action === "clear") {
      setWriteKey("");
      this.input.value = "";
      setState({ writeKeyWarning: "Write key missing or incorrect. Update it and click Save Key." });
      this.status.textContent = "Write key cleared.";
      animateStateBump(this.panel);
    }
  }

  render() {
    const state = getState();
    const hasKey = Boolean(state.writeKey);
    if (!this.input.matches(":focus")) {
      this.input.value = state.writeKey;
    }

    const message =
      state.writeKeyWarning ||
      (state.writeKeyServerReady === false
        ? "Server secret WRITE_API_KEY is not configured yet."
        : hasKey
          ? "Write key is configured."
          : "No write key set yet.");

    this.status.textContent = message;
    this.status.classList.toggle("x-status-warning", Boolean(state.writeKeyWarning || state.writeKeyServerReady === false));
  }
}

customElements.define("write-key-panel", WriteKeyPanel);
