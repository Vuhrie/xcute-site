import { createTask, deleteTask as removeTask, reorderTask, spreadSelectedGoal, updateTask } from "../core/actions.js";
import { toUiError } from "../core/api.js";
import { animatePanel, animateRows, animateStateBump } from "../core/motion.js";
import { getState, subscribeSelector } from "../core/store.js";

const template = document.createElement("template");
template.innerHTML = `
  <section class="x-goal-workspace" data-role="workspace">
    <h4 data-role="goal-header">Selected Goal Workspace</h4>
    <p class="x-small" data-role="goal-caption">Pick a goal to manage tasks and schedule.</p>

    <div class="x-divider"></div>

    <h5 class="x-workspace-title">Prioritized Tasks</h5>
    <div class="x-row">
      <label>Task title</label>
      <input type="text" name="title" placeholder="Define planner data model" />
    </div>
    <div class="x-inline">
      <div class="x-row x-grow">
        <label>Estimate (minutes)</label>
        <input type="number" name="estimate_min" min="5" step="5" value="60" />
      </div>
      <button class="c-btn" data-action="add">Add Task</button>
    </div>

    <div class="x-list" data-role="tasks"></div>

    <div class="x-divider"></div>

    <h5 class="x-workspace-title">Spread Plan</h5>
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

function taskRow(task, index, total) {
  const upDisabled = index === 0 ? "disabled" : "";
  const downDisabled = index === total - 1 ? "disabled" : "";
  const completed = Number(task.completed) === 1;
  return `<article class="x-item x-task-row ${completed ? "is-complete" : ""}">
    <div class="x-inline x-space-between">
      <div>
        <strong>#${index + 1} ${task.title}</strong>
        <div class="x-small">${task.estimate_min} min</div>
      </div>
      <div class="x-inline">
        <button class="c-btn" data-action="up" data-id="${task.id}" ${upDisabled}>Up</button>
        <button class="c-btn" data-action="down" data-id="${task.id}" ${downDisabled}>Down</button>
        <button class="c-btn" data-action="toggle" data-id="${task.id}" data-value="${completed ? 0 : 1}">
          ${completed ? "Uncomplete" : "Complete"}
        </button>
        <button class="c-btn c-btn--muted" data-action="delete" data-id="${task.id}">Delete</button>
      </div>
    </div>
  </article>`;
}

function tasksSig(tasks) {
  if (!Array.isArray(tasks) || !tasks.length) return "none";
  return tasks
    .map((task) => `${task.id || ""}:${task.priority_rank || 0}:${task.title || ""}:${task.estimate_min || 0}:${task.completed ? 1 : 0}`)
    .join("|");
}

function selectedGoalSig(state) {
  const selectedGoalId = state.selectedGoalId || "";
  if (!selectedGoalId) return "none";
  const goal = (state.goals || []).find((item) => item.id === selectedGoalId);
  if (!goal) return "none";
  return `${goal.id || ""}:${goal.title || ""}:${goal.daily_hours || 0}:${goal.target_date || ""}`;
}

function selectWorkspaceSlice(state) {
  return {
    selectedGoalId: state.selectedGoalId || "",
    goalSig: selectedGoalSig(state),
    tasksSig: tasksSig(state.tasks),
    goals: state.goals || [],
    tasks: state.tasks || [],
  };
}

function sameWorkspaceSlice(a, b) {
  if (!a || !b) return false;
  return a.selectedGoalId === b.selectedGoalId && a.goalSig === b.goalSig && a.tasksSig === b.tasksSig;
}

export class GoalWorkspacePanel extends HTMLElement {
  connectedCallback() {
    this.append(template.content.cloneNode(true));
    this.rootNode = this.querySelector('[data-role="workspace"]');
    this.tasksNode = this.querySelector('[data-role="tasks"]');
    this.statusNode = this.querySelector('[data-role="status"]');
    this.captionNode = this.querySelector('[data-role="goal-caption"]');
    this.headerNode = this.querySelector('[data-role="goal-header"]');
    animatePanel(this.rootNode);
    this.slice = selectWorkspaceSlice(getState());
    this.addEventListener("click", (event) => this.onClick(event));
    this.unsubscribe = subscribeSelector(
      selectWorkspaceSlice,
      (nextSlice) => {
        this.slice = nextSlice;
        this.render(nextSlice);
      },
      sameWorkspaceSlice
    );
    this.render(this.slice);
  }

  disconnectedCallback() {
    this.unsubscribe?.();
  }

  currentGoal() {
    const selectedGoalId = this.slice?.selectedGoalId || "";
    return (this.slice?.goals || []).find((goal) => goal.id === selectedGoalId) || null;
  }

  setStatus(message) {
    this.statusNode.textContent = message;
  }

  taskById(id) {
    return (this.slice?.tasks || []).find((task) => task.id === id) || null;
  }

  async onClick(event) {
    const action = event.target?.dataset?.action;
    if (!action) return;
    event.preventDefault();

    const goal = this.currentGoal();
    if (!goal) {
      this.setStatus("Select a goal first.");
      return;
    }

    try {
      if (action === "add") {
        const title = this.querySelector('[name="title"]').value.trim();
        if (!title) return;
        await createTask({
          goal_id: goal.id,
          title,
          estimate_min: Number.parseInt(this.querySelector('[name="estimate_min"]').value, 10) || 60,
          priority_rank: (this.slice?.tasks?.length || 0) + 1,
        });
        this.querySelector('[name="title"]').value = "";
        this.setStatus("Task added.");
        animateStateBump(this.rootNode);
        return;
      }

      if (action === "spread") {
        const startMode = this.querySelector('input[name="start_mode"]:checked')?.value || "today";
        const targetDate = this.querySelector('input[name="target_date"]').value || null;
        const result = await spreadSelectedGoal({ startMode, targetDate });
        this.setStatus(`Plan generated from ${result.start_date}${result.target_date ? ` to ${result.target_date}` : ""}.`);
        animateStateBump(this.rootNode);
        return;
      }

      const id = String(event.target.dataset.id || "");
      if (!id) return;

      if (action === "up" || action === "down") {
        await reorderTask(id, action);
        this.setStatus("Priority updated.");
        animateStateBump(this.rootNode);
        return;
      }

      if (action === "toggle") {
        await updateTask({ id, completed: event.target.dataset.value === "1" });
        this.setStatus("Task status updated.");
        animateStateBump(this.rootNode);
        return;
      }

      if (action === "delete") {
        const task = this.taskById(id);
        const approved = window.confirm(`Delete task "${task?.title || "this task"}"?`);
        if (!approved) return;
        await removeTask(id);
        this.setStatus("Task deleted.");
        animateStateBump(this.rootNode);
      }
    } catch (error) {
      this.setStatus(`Error: ${toUiError(error)}`);
    }
  }

  render(slice = this.slice || selectWorkspaceSlice(getState())) {
    const goal = (slice.goals || []).find((item) => item.id === slice.selectedGoalId) || null;
    const tasks = slice.tasks || [];

    this.rootNode.classList.toggle("is-open", Boolean(goal));

    if (!goal) {
      this.headerNode.textContent = "Selected Goal Workspace";
      this.captionNode.textContent = "Pick a goal to manage tasks and schedule.";
      this.tasksNode.innerHTML = `<article class="x-item x-small">No goal selected.</article>`;
      return;
    }

    this.headerNode.textContent = `Workspace For: ${goal.title}`;
    const targetLabel = goal.target_date ? `Target: ${goal.target_date}` : "Daily";
    this.captionNode.textContent = `${goal.daily_hours}h/day | ${targetLabel}`;

    if (!tasks.length) {
      this.tasksNode.innerHTML = `<article class="x-item x-small">No tasks yet for this goal.</article>`;
      return;
    }

    this.tasksNode.innerHTML = tasks.map((task, index) => taskRow(task, index, tasks.length)).join("");
    animateRows(this.tasksNode, ".x-task-row", 28);
  }
}

customElements.define("goal-workspace-panel", GoalWorkspacePanel);
