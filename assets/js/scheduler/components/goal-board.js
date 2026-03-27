import { api } from "../core/api.js";
import { getState, setState, subscribe } from "../core/store.js";

const template = document.createElement("template");
template.innerHTML = `
  <section class="x-panel">
    <h3>Goals & Milestones</h3>
    <div class="x-row">
      <label>Goal title</label>
      <input type="text" name="goal_title" placeholder="Ship scheduler MVP" />
    </div>
    <div class="x-inline">
      <input type="date" name="goal_date" />
      <button class="c-btn" data-action="add-goal">Add Goal</button>
    </div>
    <div class="x-row">
      <label>Milestone title</label>
      <input type="text" name="mile_title" placeholder="Complete planner engine" />
    </div>
    <div class="x-inline">
      <select name="goal_id"></select>
      <button class="c-btn" data-action="add-mile">Add Milestone</button>
    </div>
    <div class="x-list" data-role="list"></div>
  </section>
`;

export class GoalBoard extends HTMLElement {
  connectedCallback() {
    this.append(template.content.cloneNode(true));
    this.goalTitle = this.querySelector('input[name="goal_title"]');
    this.goalDate = this.querySelector('input[name="goal_date"]');
    this.mileTitle = this.querySelector('input[name="mile_title"]');
    this.goalSelect = this.querySelector('select[name="goal_id"]');
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
    if (!action || !getState().token) return;
    event.preventDefault();

    if (action === "add-goal") {
      if (!this.goalTitle.value.trim()) return;
      await api.createGoal({
        title: this.goalTitle.value.trim(),
        target_date: this.goalDate.value || null,
      });
      this.goalTitle.value = "";
      this.dispatchEvent(new CustomEvent("data-refresh", { bubbles: true }));
    }

    if (action === "add-mile") {
      if (!this.mileTitle.value.trim()) return;
      await api.createMilestone({
        title: this.mileTitle.value.trim(),
        goal_id: this.goalSelect.value || null,
      });
      this.mileTitle.value = "";
      this.dispatchEvent(new CustomEvent("data-refresh", { bubbles: true }));
    }
  }

  render() {
    const { goals, milestones } = getState();
    this.goalSelect.innerHTML = `<option value="">No Goal</option>${goals
      .map((goal) => `<option value="${goal.id}">${goal.title}</option>`)
      .join("")}`;

    const mileByGoal = new Map();
    for (const milestone of milestones) {
      const key = milestone.goal_id || "_none";
      if (!mileByGoal.has(key)) mileByGoal.set(key, []);
      mileByGoal.get(key).push(milestone);
    }

    this.list.innerHTML = goals
      .map((goal) => {
        const sub = mileByGoal.get(goal.id) || [];
        return `<article class="x-item">
          <strong>${goal.title}</strong>
          <div class="x-small">Target: ${goal.target_date || "n/a"}</div>
          <div class="x-small">Milestones: ${sub.map((m) => m.title).join(", ") || "none"}</div>
        </article>`;
      })
      .join("");
  }
}

customElements.define("goal-board", GoalBoard);

