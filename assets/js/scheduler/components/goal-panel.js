import { createGoal, refreshGoalData, selectGoal, updateGoal } from "../core/actions.js";
import { getState, subscribe } from "../core/store.js";

const template = document.createElement("template");
template.innerHTML = `
  <section class="x-panel">
    <h3>Goals</h3>
    <div class="x-row">
      <label>Goal title</label>
      <input type="text" name="title" placeholder="Launch XCute scheduler" />
    </div>
    <div class="x-inline">
      <div class="x-row x-grow">
        <label>Daily hours</label>
        <input type="number" name="daily_hours" min="1" max="16" value="2" />
      </div>
      <div class="x-row x-grow">
        <label>Target date (optional)</label>
        <input type="date" name="target_date" />
      </div>
      <button class="c-btn" data-action="create">Add Goal</button>
    </div>

    <div class="x-list" data-role="goals"></div>
    <p class="x-small" data-role="status"></p>
  </section>
`;

function cardMarkup(goal, selectedGoalId, editingGoalId) {
  const active = goal.id === selectedGoalId ? " is-active" : "";
  const isEditing = goal.id === editingGoalId;
  return `<article class="x-item${active}">
    <div class="x-inline x-space-between">
      <div>
        <strong>${goal.title}</strong>
        <div class="x-small">${goal.daily_hours}h/day | Target: ${goal.target_date || "none"}</div>
      </div>
      <div class="x-inline">
        <button class="c-btn" data-action="select" data-id="${goal.id}">Use</button>
        <button class="c-btn c-btn--muted" data-action="edit-start" data-id="${goal.id}">Edit</button>
      </div>
    </div>
    ${
      isEditing
        ? `<div class="x-edit-goal" data-edit-id="${goal.id}">
      <div class="x-inline">
        <div class="x-row x-grow">
          <label>Daily hours</label>
          <input type="number" name="edit_daily_hours" min="1" max="16" value="${goal.daily_hours || 2}" />
        </div>
        <div class="x-row x-grow">
          <label>Target date (optional)</label>
          <input type="date" name="edit_target_date" value="${goal.target_date || ""}" />
        </div>
      </div>
      <div class="x-inline">
        <button class="c-btn" data-action="edit-save" data-id="${goal.id}">Save</button>
        <button class="c-btn c-btn--muted" data-action="edit-cancel">Cancel</button>
      </div>
    </div>`
        : ""
    }
  </article>`;
}

export class GoalPanel extends HTMLElement {
  connectedCallback() {
    this.append(template.content.cloneNode(true));
    this.status = this.querySelector('[data-role="status"]');
    this.goalList = this.querySelector('[data-role="goals"]');
    this.editingGoalId = "";
    this.addEventListener("click", (event) => this.onClick(event));
    this.unsubscribe = subscribe(() => this.render());
    this.render();
  }

  disconnectedCallback() {
    this.unsubscribe?.();
  }

  async onClick(event) {
    const action = event.target?.dataset?.action;
    if (!action) return;
    event.preventDefault();

    try {
      if (action === "create") {
        const title = this.querySelector('[name="title"]').value.trim();
        if (!title) return;
        await createGoal({
          title,
          daily_hours: Number.parseInt(this.querySelector('[name="daily_hours"]').value, 10) || 2,
          target_date: this.querySelector('[name="target_date"]').value || null,
        });
        this.querySelector('[name="title"]').value = "";
        this.status.textContent = "Goal created.";
        return;
      }

      if (action === "select") {
        const id = String(event.target.dataset.id || "");
        if (!id) return;
        selectGoal(id);
        await refreshGoalData(id);
        this.status.textContent = "Goal selected.";
        return;
      }

      if (action === "edit-start") {
        this.editingGoalId = String(event.target.dataset.id || "");
        this.status.textContent = "Editing goal.";
        this.render();
        return;
      }

      if (action === "edit-cancel") {
        this.editingGoalId = "";
        this.status.textContent = "Edit canceled.";
        this.render();
        return;
      }

      if (action === "edit-save") {
        const id = String(event.target.dataset.id || "");
        if (!id) return;
        const scope = this.querySelector(`[data-edit-id="${id}"]`);
        if (!scope) return;
        await updateGoal({
          id,
          daily_hours: Number.parseInt(scope.querySelector('[name="edit_daily_hours"]').value, 10) || 2,
          target_date: scope.querySelector('[name="edit_target_date"]').value || null,
        });
        this.editingGoalId = "";
        this.status.textContent = "Goal updated.";
      }
    } catch (error) {
      this.status.textContent = `Error: ${error.message}`;
    }
  }

  render() {
    const { goals, selectedGoalId } = getState();
    if (!goals.some((goal) => goal.id === this.editingGoalId)) {
      this.editingGoalId = "";
    }
    this.goalList.innerHTML = goals.map((goal) => cardMarkup(goal, selectedGoalId, this.editingGoalId)).join("");
  }
}

customElements.define("goal-panel", GoalPanel);
