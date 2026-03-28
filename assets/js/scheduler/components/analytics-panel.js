import { animatePanel } from "../core/motion.js";
import { getState, subscribeSelector } from "../core/store.js";

const template = document.createElement("template");
template.innerHTML = `
  <section class="x-panel x-analytics-panel">
    <h3>Analytics</h3>
    <p class="x-small">Execution quality, progress trends, and rollover load.</p>
    <div class="x-list" data-role="summary"></div>
    <div class="x-list" data-role="series"></div>
    <div class="x-list" data-role="goals"></div>
  </section>
`;

function formatMinutes(value) {
  const minutes = Number.parseInt(value, 10) || 0;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}

function analyticsSig(analyticsDay, analyticsRange) {
  const day = analyticsDay?.summary
    ? `${analyticsDay.summary.date}:${analyticsDay.summary.planned_min}:${analyticsDay.summary.completed_min}:${analyticsDay.summary.start_count}:${analyticsDay.summary.complete_count}`
    : "none";
  const rangeSeries = (analyticsRange?.series || []).map((row) => `${row.date}:${row.planned_min}:${row.completed_min}:${row.carried_count}`).join("|");
  const rangeGoals = (analyticsRange?.goals || []).map((goal) => `${goal.id}:${goal.planned_min}:${goal.completed_min}:${goal.risk_level}`).join("|");
  return `${day}::${rangeSeries}::${rangeGoals}`;
}

function selectAnalyticsSlice(state) {
  return {
    analyticsDay: state.analyticsDay || null,
    analyticsRange: state.analyticsRange || null,
    sig: analyticsSig(state.analyticsDay, state.analyticsRange),
  };
}

function sameAnalyticsSlice(a, b) {
  if (!a || !b) return false;
  return a.sig === b.sig;
}

export class AnalyticsPanel extends HTMLElement {
  connectedCallback() {
    this.append(template.content.cloneNode(true));
    this.summaryNode = this.querySelector('[data-role="summary"]');
    this.seriesNode = this.querySelector('[data-role="series"]');
    this.goalsNode = this.querySelector('[data-role="goals"]');
    animatePanel(this.querySelector(".x-panel"));
    this.slice = selectAnalyticsSlice(getState());
    this.unsubscribe = subscribeSelector(
      selectAnalyticsSlice,
      (nextSlice) => {
        this.slice = nextSlice;
        this.render(nextSlice);
      },
      sameAnalyticsSlice
    );
    this.render(this.slice);
  }

  disconnectedCallback() {
    this.unsubscribe?.();
  }

  render(slice = this.slice || selectAnalyticsSlice(getState())) {
    const summary = slice.analyticsDay?.summary || null;
    const range = slice.analyticsRange || { series: [], goals: [] };
    const series = range.series || [];
    const goals = range.goals || [];

    if (!summary) {
      this.summaryNode.innerHTML = `<article class="x-item x-small">Analytics will appear after data sync.</article>`;
    } else {
      this.summaryNode.innerHTML = `
        <article class="x-item x-analytics-summary">
          <strong>Today (${summary.date})</strong>
          <div class="x-small">Planned ${formatMinutes(summary.planned_min)} | Completed ${formatMinutes(summary.completed_min)}</div>
          <div class="x-small">Starts ${summary.start_count} | Completed ${summary.complete_count} | Skips ${summary.skip_count}</div>
          <div class="x-small">Pauses ${summary.pause_count} | Rollover carried ${summary.carried_count} | Unscheduled ${summary.unscheduled_count}</div>
        </article>
      `;
    }

    if (!series.length) {
      this.seriesNode.innerHTML = "";
    } else {
      const maxPlanned = Math.max(...series.map((row) => Number.parseInt(row.planned_min, 10) || 0), 1);
      const rows = series
        .map((row) => {
          const planned = Number.parseInt(row.planned_min, 10) || 0;
          const completed = Number.parseInt(row.completed_min, 10) || 0;
          const plannedRatio = Math.min(100, Math.round((planned / maxPlanned) * 100));
          const completeRatio = planned > 0 ? Math.min(100, Math.round((completed / planned) * 100)) : 0;
          return `<article class="x-item x-analytics-day-row">
            <div class="x-inline x-space-between">
              <strong>${row.date}</strong>
              <span class="x-small">${formatMinutes(completed)} / ${formatMinutes(planned)}</span>
            </div>
            <div class="x-progress"><div class="x-progress__bar" style="transform: scaleX(${plannedRatio / 100})"></div></div>
            <div class="x-small">Execution ${completeRatio}% | Starts ${row.start_count} | Completes ${row.complete_count} | Skips ${row.skip_count}</div>
          </article>`;
        })
        .join("");
      this.seriesNode.innerHTML = `<article class="x-item"><strong>Range Trend</strong><div class="x-list">${rows}</div></article>`;
    }

    if (!goals.length) {
      this.goalsNode.innerHTML = "";
      return;
    }

    const rows = goals
      .map((goal) => {
        const total = Number.parseInt(goal.planned_min, 10) || 0;
        const done = Number.parseInt(goal.completed_min, 10) || 0;
        const ratio = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
        return `<article class="x-item x-analytics-goal-row">
          <div class="x-inline x-space-between">
            <strong>${goal.title}</strong>
            <span class="x-small">${goal.risk_level || "none"} risk</span>
          </div>
          <div class="x-small">Target: ${goal.target_date || "Daily"} | Pending ${formatMinutes(goal.pending_min)} | ${goal.weight_level} weight</div>
          <div class="x-progress"><div class="x-progress__bar" style="transform: scaleX(${ratio})"></div></div>
        </article>`;
      })
      .join("");
    this.goalsNode.innerHTML = `<article class="x-item"><strong>Goal Trend</strong><div class="x-list">${rows}</div></article>`;
  }
}

customElements.define("analytics-panel", AnalyticsPanel);
