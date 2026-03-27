import { api } from "../core/api.js";
import { getState, setState, subscribe } from "../core/store.js";

const template = document.createElement("template");
template.innerHTML = `
  <section class="x-panel">
    <h3>Planner Settings</h3>
    <div class="x-row"><label>Date</label><input type="date" name="date" /></div>
    <div class="x-inline">
      <div class="x-row"><label>Timezone</label><input type="text" name="timezone" /></div>
      <div class="x-row"><label>Work Start</label><input type="time" name="work_start" /></div>
      <div class="x-row"><label>Work End</label><input type="time" name="work_end" /></div>
    </div>
    <div class="x-inline">
      <div class="x-row"><label>Break (min)</label><input type="number" name="break_min" min="5" max="45" /></div>
      <div class="x-row"><label>Buffer (min)</label><input type="number" name="buffer_min" min="0" max="30" /></div>
    </div>
    <div class="x-inline">
      <button class="c-btn" data-action="save">Save Settings</button>
      <button class="c-btn" data-action="generate">Generate Day</button>
      <button class="c-btn" data-action="reflow">Reflow Day</button>
    </div>
    <p class="x-small" data-role="status"></p>
  </section>
`;

export class SettingsPanel extends HTMLElement {
  connectedCallback() {
    this.append(template.content.cloneNode(true));
    this.status = this.querySelector('[data-role="status"]');
    this.dateInput = this.querySelector('[name="date"]');
    this.dateInput.value = getState().date;
    this.addEventListener("click", (event) => this.onClick(event));
    this.dateInput.addEventListener("change", () => setState({ date: this.dateInput.value }));
    this.unsubscribe = subscribe(() => this.render());
    this.render();
  }

  disconnectedCallback() {
    this.unsubscribe?.();
  }

  readForm() {
    const get = (name) => this.querySelector(`[name="${name}"]`).value;
    return {
      timezone: get("timezone"),
      work_start: get("work_start"),
      work_end: get("work_end"),
      break_min: Number.parseInt(get("break_min"), 10) || 10,
      buffer_min: Number.parseInt(get("buffer_min"), 10) || 5,
    };
  }

  async onClick(event) {
    const action = event.target?.dataset?.action;
    if (!action || !getState().token) return;
    event.preventDefault();

    try {
      if (action === "save") {
        const item = (await api.patchPreferences(this.readForm())).item;
        setState({ preferences: item });
        this.status.textContent = "Settings saved.";
        return;
      }

      if (action === "generate") {
        const result = await api.generate(getState().date);
        setState({ blocks: result.blocks || [], deferred: result.deferred || [] });
        this.status.textContent = "Schedule generated.";
        return;
      }

      if (action === "reflow") {
        const result = await api.reflow(getState().date);
        setState({ blocks: result.blocks || [], deferred: result.deferred || [] });
        this.status.textContent = "Schedule reflowed.";
      }
    } catch (error) {
      this.status.textContent = `Error: ${error.message}`;
    }
  }

  render() {
    const prefs = getState().preferences || {};
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    this.querySelector('[name="timezone"]').value = prefs.timezone || detected;
    this.querySelector('[name="work_start"]').value = prefs.work_start || "09:00";
    this.querySelector('[name="work_end"]').value = prefs.work_end || "18:00";
    this.querySelector('[name="break_min"]').value = prefs.break_min ?? 10;
    this.querySelector('[name="buffer_min"]').value = prefs.buffer_min ?? 5;
  }
}

customElements.define("settings-panel", SettingsPanel);

