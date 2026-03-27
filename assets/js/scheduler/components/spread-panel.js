import { spreadSelectedGoal } from "../core/actions.js";
import { getState } from "../core/store.js";

const template = document.createElement("template");
template.innerHTML = `
  <section class="x-panel">
    <h3>Spread Plan</h3>
    <div class="x-row">
      <label>Start mode</label>
      <div class="x-inline">
        <label><input type="radio" name="start_mode" value="today" checked /> Today</label>
        <label><input type="radio" name="start_mode" value="tomorrow" /> Tomorrow</label>
      </div>
    </div>
    <div class="x-row">
      <label>Target date override (optional)</label>
      <input type="date" name="target_date" />
    </div>
    <div class="x-inline">
      <button class="c-btn" data-action="spread">Generate Plan</button>
    </div>
    <p class="x-small" data-role="status"></p>
  </section>
`;

export class SpreadPanel extends HTMLElement {
  connectedCallback() {
    this.append(template.content.cloneNode(true));
    this.status = this.querySelector('[data-role="status"]');
    this.addEventListener("click", (event) => this.onClick(event));
  }

  async onClick(event) {
    const action = event.target?.dataset?.action;
    if (action !== "spread") return;
    event.preventDefault();

    const selectedGoalId = getState().selectedGoalId;
    if (!selectedGoalId) {
      this.status.textContent = "Select a goal first.";
      return;
    }

    try {
      const startMode = this.querySelector('input[name="start_mode"]:checked')?.value || "today";
      const targetDate = this.querySelector('input[name="target_date"]').value || null;
      const result = await spreadSelectedGoal({ startMode, targetDate });
      this.status.textContent = `Plan generated from ${result.start_date}${result.target_date ? ` to ${result.target_date}` : ""}.`;
    } catch (error) {
      this.status.textContent = `Error: ${error.message}`;
    }
  }
}

customElements.define("spread-panel", SpreadPanel);
