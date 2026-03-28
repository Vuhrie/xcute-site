import { createGoal, deleteGoal as removeGoal, refreshGoalData, selectGoal, updateGoal } from "../core/actions.js";
import { toUiError } from "../core/api.js";
import { animatePanel, animateRows, animateStateBump } from "../core/motion.js";
import { getState, subscribeSelector } from "../core/store.js";

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
      <div class="x-row x-grow">
        <label>Importance</label>
        <select name="weight_level">
          <option value="low">Low</option>
          <option value="medium" selected>Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <button class="c-btn" data-action="create">Add Goal</button>
    </div>

    <div class="x-list" data-role="goals"></div>
    <goal-workspace-panel class="x-goal-workspace-shell"></goal-workspace-panel>
    <p class="x-small" data-role="status"></p>
  </section>
`;

function formatWeight(level) {
  const normalized = String(level || "medium").toLowerCase();
  if (normalized === "high") return "High";
  if (normalized === "low") return "Low";
  return "Medium";
}

function goalMeta(goal) {
  const target = goal.target_date ? `Target: ${goal.target_date}` : "Daily";
  return `${goal.daily_hours}h/day | ${target} | ${formatWeight(goal.weight_level)}`;
}

function cardMarkup(goal, selectedGoalId, editingGoalId) {
  const active = goal.id === selectedGoalId ? " is-active is-selected" : "";
  const isEditing = goal.id === editingGoalId;
  const isSelected = goal.id === selectedGoalId;
  return `<article class="x-item x-goal-card x-goal-row${active}">
    <div class="x-inline x-space-between">
      <div>
        <strong>${goal.title}</strong>
        <div class="x-small">${goalMeta(goal)}</div>
        ${isSelected ? `<div class="x-selected-tag">Selected Goal Workspace</div>` : ""}
      </div>
      <div class="x-inline">
        <button class="c-btn" data-action="select" data-id="${goal.id}">Use</button>
        <button class="c-btn c-btn--muted" data-action="edit-start" data-id="${goal.id}">Edit</button>
        <button class="c-btn c-btn--muted" data-action="delete" data-id="${goal.id}">Delete</button>
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
        <div class="x-row x-grow">
          <label>Importance</label>
          <select name="edit_weight_level">
            <option value="low" ${goal.weight_level === "low" ? "selected" : ""}>Low</option>
            <option value="medium" ${goal.weight_level === "medium" ? "selected" : ""}>Medium</option>
            <option value="high" ${goal.weight_level === "high" ? "selected" : ""}>High</option>
          </select>
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

function goalsSig(goals) {
  if (!Array.isArray(goals) || !goals.length) return "none";
  return goals
    .map((goal) => `${goal.id || ""}:${goal.title || ""}:${goal.daily_hours || 0}:${goal.target_date || ""}:${goal.weight_level || "medium"}`)
    .join("|");
}

function selectGoalsSlice(state) {
  return {
    goals: state.goals || [],
    selectedGoalId: state.selectedGoalId || "",
    sig: goalsSig(state.goals),
  };
}

function sameGoalsSlice(a, b) {
  if (!a || !b) return false;
  return a.selectedGoalId === b.selectedGoalId && a.sig === b.sig;
}

export class GoalPanel extends HTMLElement {
  connectedCallback() {
    this.append(template.content.cloneNode(true));
    this.status = this.querySelector('[data-role="status"]');
    this.goalList = this.querySelector('[data-role="goals"]');
    animatePanel(this.querySelector(".x-panel"));
    this.editingGoalId = "";
    this.slice = selectGoalsSlice(getState());
    this.addEventListener("click", (event) => this.onClick(event));
    this.unsubscribe = subscribeSelector(
      selectGoalsSlice,
      (nextSlice) => {
        this.slice = nextSlice;
        this.render(nextSlice);
      },
      sameGoalsSlice
    );
    this.render(this.slice);
  }

  disconnectedCallback() {
    this.unsubscribe?.();
  }

  setStatus(message) {
    this.status.textContent = message;
  }

  goalById(id) {
    return getState().goals.find((goal) => goal.id === id) || null;
  }

  clearEditingIf(id) {
    if (this.editingGoalId === id) this.editingGoalId = "";
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
          weight_level: this.querySelector('[name="weight_level"]').value || "medium",
        });
        this.querySelector('[name="title"]').value = "";
        this.setStatus("Goal created.");
        animateStateBump(this.goalList);
        return;
      }

      if (action === "select") {
        const id = String(event.target.dataset.id || "");
        if (!id) return;
        selectGoal(id);
        await refreshGoalData(id);
        this.setStatus("Goal selected.");
        animateStateBump(this.goalList);
        return;
      }

      if (action === "edit-start") {
        this.editingGoalId = String(event.target.dataset.id || "");
        this.setStatus("Editing goal.");
        this.render();
        return;
      }

      if (action === "edit-cancel") {
        this.editingGoalId = "";
        this.setStatus("Edit canceled.");
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
          weight_level: scope.querySelector('[name="edit_weight_level"]').value || "medium",
        });
        this.editingGoalId = "";
        this.setStatus("Goal updated.");
        animateStateBump(this.goalList);
        return;
      }

      if (action === "delete") {
        const id = String(event.target.dataset.id || "");
        if (!id) return;
        const goal = this.goalById(id);
        const approved = window.confirm(`Delete goal "${goal?.title || "this goal"}" and all linked tasks/schedule data?`);
        if (!approved) return;
        await removeGoal(id);
        this.clearEditingIf(id);
        this.setStatus("Goal deleted.");
        animateStateBump(this.goalList);
      }
    } catch (error) {
      this.setStatus(`Error: ${toUiError(error)}`);
    }
  }

  render(slice = this.slice || selectGoalsSlice(getState())) {
    const goals = slice.goals || [];
    const selectedGoalId = slice.selectedGoalId || "";
    if (!goals.some((goal) => goal.id === this.editingGoalId)) {
      this.editingGoalId = "";
    }
    this.goalList.innerHTML = goals.map((goal) => cardMarkup(goal, selectedGoalId, this.editingGoalId)).join("");
    animateRows(this.goalList, ".x-goal-row", 0);
  }
}

customElements.define("goal-panel", GoalPanel);
