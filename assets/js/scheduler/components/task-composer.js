import { api } from "../core/api.js";
import { getState, subscribe } from "../core/store.js";

const template = document.createElement("template");
template.innerHTML = `
  <section class="x-panel">
    <h3>Tasks</h3>
    <div class="x-row">
      <label>Task title</label>
      <input type="text" name="title" placeholder="Deep work: planner API cleanup" />
    </div>
    <div class="x-inline">
      <div class="x-row">
        <label>Duration (min)</label>
        <input type="number" name="duration_min" min="10" step="5" value="30" />
      </div>
      <div class="x-row">
        <label>Priority</label>
        <select name="priority">
          <option value="5">5 - Critical</option>
          <option value="4">4 - High</option>
          <option value="3" selected>3 - Normal</option>
          <option value="2">2 - Low</option>
          <option value="1">1 - Optional</option>
        </select>
      </div>
    </div>
    <details>
      <summary>Advanced fields</summary>
      <div class="x-row"><label>Deadline</label><input type="datetime-local" name="deadline" /></div>
      <div class="x-row"><label>Category</label><input type="text" name="category" placeholder="work / health / learning" /></div>
      <div class="x-row">
        <label>Energy</label>
        <select name="energy">
          <option value="high">High</option>
          <option value="medium" selected>Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div class="x-row"><label>Depends on task</label><select name="depends_on"></select></div>
      <div class="x-row"><label>Goal</label><select name="goal_id"></select></div>
      <div class="x-row"><label>Milestone</label><select name="milestone_id"></select></div>
      <div class="x-row"><label><input type="checkbox" name="locked" /> Lock schedule block once created</label></div>
    </details>
    <div class="x-inline">
      <button class="c-btn" data-action="add">Add Task</button>
      <span class="x-small" data-role="status"></span>
    </div>
    <div class="x-list" data-role="list"></div>
  </section>
`;

function parseForm(host) {
  const read = (name) => host.querySelector(`[name="${name}"]`);
  return {
    title: read("title").value.trim(),
    duration_min: Number.parseInt(read("duration_min").value, 10) || 30,
    priority: Number.parseInt(read("priority").value, 10) || 3,
    deadline: read("deadline").value ? new Date(read("deadline").value).toISOString() : null,
    category: read("category").value.trim() || null,
    energy: read("energy").value || "medium",
    depends_on: read("depends_on").value || null,
    goal_id: read("goal_id").value || null,
    milestone_id: read("milestone_id").value || null,
    locked: read("locked").checked,
  };
}

export class TaskComposer extends HTMLElement {
  connectedCallback() {
    this.append(template.content.cloneNode(true));
    this.list = this.querySelector('[data-role="list"]');
    this.status = this.querySelector('[data-role="status"]');
    this.dependsSelect = this.querySelector('select[name="depends_on"]');
    this.goalSelect = this.querySelector('select[name="goal_id"]');
    this.mileSelect = this.querySelector('select[name="milestone_id"]');
    this.addEventListener("click", (event) => this.onClick(event));
    this.unsubscribe = subscribe(() => this.render());
    this.render();
  }

  disconnectedCallback() {
    this.unsubscribe?.();
  }

  async onClick(event) {
    const action = event.target?.dataset?.action;
    if (action !== "add" || !getState().token) return;
    event.preventDefault();
    const payload = parseForm(this);
    if (!payload.title) return;
    try {
      await api.createTask(payload);
      this.querySelector('[name="title"]').value = "";
      this.status.textContent = "Task added.";
      this.dispatchEvent(new CustomEvent("data-refresh", { bubbles: true }));
    } catch (error) {
      this.status.textContent = `Error: ${error.message}`;
    }
  }

  render() {
    const { tasks, goals, milestones } = getState();
    this.dependsSelect.innerHTML = `<option value="">None</option>${tasks
      .map((task) => `<option value="${task.id}">${task.title}</option>`)
      .join("")}`;
    this.goalSelect.innerHTML = `<option value="">None</option>${goals
      .map((goal) => `<option value="${goal.id}">${goal.title}</option>`)
      .join("")}`;
    this.mileSelect.innerHTML = `<option value="">None</option>${milestones
      .map((milestone) => `<option value="${milestone.id}">${milestone.title}</option>`)
      .join("")}`;
    this.list.innerHTML = tasks
      .map(
        (task) => `<article class="x-item">
          <strong>${task.title}</strong>
          <div class="x-small">${task.duration_min} min | Priority ${task.priority} | ${task.energy}</div>
          <div class="x-small">Deadline: ${task.deadline || "none"}</div>
        </article>`
      )
      .join("");
  }
}

customElements.define("task-composer", TaskComposer);

