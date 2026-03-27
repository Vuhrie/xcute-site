import { createTask, reorderTask, updateTask } from "../core/actions.js";
import { getState, subscribe } from "../core/store.js";

const template = document.createElement("template");
template.innerHTML = `
  <section class="x-panel">
    <h3>Prioritized Tasks</h3>
    <p class="x-small">Add tasks for the selected goal. Top task = highest priority.</p>
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
    <p class="x-small" data-role="status"></p>
  </section>
`;

function taskRow(task, index, total) {
  const upDisabled = index === 0 ? "disabled" : "";
  const downDisabled = index === total - 1 ? "disabled" : "";
  const completed = Number(task.completed) === 1;
  return `<article class="x-item ${completed ? "is-complete" : ""}">
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
      </div>
    </div>
  </article>`;
}

export class TaskPanel extends HTMLElement {
  connectedCallback() {
    this.append(template.content.cloneNode(true));
    this.list = this.querySelector('[data-role="tasks"]');
    this.status = this.querySelector('[data-role="status"]');
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

    const selectedGoalId = getState().selectedGoalId;
    if (!selectedGoalId) {
      this.status.textContent = "Pick a goal first.";
      return;
    }

    try {
      if (action === "add") {
        const title = this.querySelector('[name="title"]').value.trim();
        if (!title) return;
        await createTask({
          goal_id: selectedGoalId,
          title,
          estimate_min: Number.parseInt(this.querySelector('[name="estimate_min"]').value, 10) || 60,
          priority_rank: (getState().tasks?.length || 0) + 1,
        });
        this.querySelector('[name="title"]').value = "";
        this.status.textContent = "Task added.";
        return;
      }

      const id = String(event.target.dataset.id || "");
      if (!id) return;

      if (action === "up" || action === "down") {
        await reorderTask(id, action);
        this.status.textContent = "Priority updated.";
        return;
      }

      if (action === "toggle") {
        await updateTask({ id, completed: event.target.dataset.value === "1" });
        this.status.textContent = "Task status updated.";
      }
    } catch (error) {
      this.status.textContent = `Error: ${error.message}`;
    }
  }

  render() {
    const { selectedGoalId, tasks } = getState();
    if (!selectedGoalId) {
      this.list.innerHTML = `<article class="x-item x-small">Select a goal to manage tasks.</article>`;
      return;
    }

    if (!tasks.length) {
      this.list.innerHTML = `<article class="x-item x-small">No tasks yet for this goal.</article>`;
      return;
    }

    this.list.innerHTML = tasks.map((task, index) => taskRow(task, index, tasks.length)).join("");
  }
}

customElements.define("task-panel", TaskPanel);
