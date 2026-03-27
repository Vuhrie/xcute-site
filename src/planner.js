const MINUTES_PER_DAY = 24 * 60;

function clampInt(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return min;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function parseClock(value, fallback) {
  const raw = typeof value === "string" ? value : fallback;
  const [h, m] = raw.split(":").map((part) => Number.parseInt(part, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return parseClock(fallback, "09:00");
  return clampInt(h * 60 + m, 0, MINUTES_PER_DAY - 1);
}

function isoToDateMinute(iso) {
  const date = new Date(iso);
  return date.getHours() * 60 + date.getMinutes();
}

function minuteToIso(dateIso, minute) {
  const date = new Date(`${dateIso}T00:00:00`);
  const safe = clampInt(minute, 0, MINUTES_PER_DAY - 1);
  date.setMinutes(safe);
  return date.toISOString();
}

function daysUntil(dateIso, deadlineIso) {
  if (!deadlineIso) return 60;
  const now = new Date(`${dateIso}T00:00:00`).getTime();
  const target = new Date(deadlineIso).getTime();
  if (Number.isNaN(target)) return 60;
  return Math.floor((target - now) / (1000 * 60 * 60 * 24));
}

function taskScore(task, dateIso) {
  const priority = clampInt(task.priority ?? 3, 1, 5);
  const days = daysUntil(dateIso, task.deadline);
  const deadlineBoost = days <= 0 ? 35 : Math.max(0, 25 - days);
  const goalBoost = task.goal_id ? 9 : 0;
  const milestoneBoost = task.milestone_id ? 6 : 0;
  const energyBoost = task.energy === "high" ? 4 : task.energy === "low" ? 1 : 2;
  return priority * 18 + deadlineBoost + goalBoost + milestoneBoost + energyBoost;
}

function collectBlockedRanges(blocks) {
  return blocks
    .map((block) => ({
      start: isoToDateMinute(block.start_at),
      end: isoToDateMinute(block.end_at),
      block,
    }))
    .sort((a, b) => a.start - b.start);
}

function isRangeFree(ranges, start, end) {
  for (const range of ranges) {
    if (end <= range.start) break;
    if (start < range.end && end > range.start) return false;
  }
  return true;
}

function makeDependencySet(tasks) {
  const done = new Set();
  for (const task of tasks) {
    if (task.completed) done.add(task.id);
  }
  return done;
}

function hasUnmetDependency(task, completedIds) {
  if (!task.depends_on) return false;
  return !completedIds.has(task.depends_on);
}

export function buildSchedule({
  dateIso,
  tasks,
  fixedBlocks,
  preferences,
  source = "auto",
}) {
  const startMinute = parseClock(preferences?.work_start, "09:00");
  const endMinute = parseClock(preferences?.work_end, "18:00");
  const breakMinute = clampInt(preferences?.break_min, 5, 45);
  const bufferMinute = clampInt(preferences?.buffer_min, 0, 30);
  const workEnd = Math.max(startMinute + 60, endMinute);

  const lockedRanges = collectBlockedRanges(fixedBlocks);
  const planned = [];
  const deferred = [];
  const completedIds = makeDependencySet(tasks);

  const candidates = tasks
    .filter((task) => !task.completed)
    .map((task) => ({ task, score: taskScore(task, dateIso) }))
    .sort((a, b) => b.score - a.score);

  let cursor = startMinute;

  for (const candidate of candidates) {
    const task = candidate.task;
    const duration = clampInt(task.duration_min ?? 30, 10, 240);

    if (hasUnmetDependency(task, completedIds)) {
      deferred.push({
        task_id: task.id,
        title: task.title,
        reason: "dependency",
      });
      continue;
    }

    let placed = false;
    let probe = cursor;
    const deadlineGuard = workEnd - duration;

    while (probe <= deadlineGuard) {
      const start = probe;
      const end = start + duration;
      if (!isRangeFree(lockedRanges, start, end)) {
        probe += 5;
        continue;
      }
      if (!isRangeFree(planned, start, end)) {
        probe += 5;
        continue;
      }

      const block = {
        task_id: task.id,
        title: task.title,
        date: dateIso,
        start_at: minuteToIso(dateIso, start),
        end_at: minuteToIso(dateIso, end),
        locked: task.locked ? 1 : 0,
        completed: 0,
        source,
        score: candidate.score,
      };
      planned.push({ start, end, block });
      completedIds.add(task.id);
      cursor = end + breakMinute + bufferMinute;
      placed = true;
      break;
    }

    if (!placed) {
      deferred.push({
        task_id: task.id,
        title: task.title,
        reason: "capacity",
      });
    }
  }

  const blocks = planned
    .sort((a, b) => a.start - b.start)
    .map((item) => item.block);

  return { blocks, deferred };
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

