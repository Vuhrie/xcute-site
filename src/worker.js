const SHARED_SCOPE = "shared";
const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const GOAL_WEIGHT_LEVELS = new Set(["low", "medium", "high"]);
const GOAL_WEIGHT_SCORE = {
  low: 1,
  medium: 2,
  high: 3,
};
const DEADLINE_CONFLICT_REASON = "deadline_blocked";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function nowIso() {
  return new Date().toISOString();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateIso, days) {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function asDateOrNull(value) {
  const raw = String(value || "").trim();
  return DATE_PATTERN.test(raw) ? raw : null;
}

function asDateOrDefault(value, fallback) {
  return asDateOrNull(value) || fallback;
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function asInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toWeightLevel(value, fallback = "medium") {
  const normalized = String(value || "").trim().toLowerCase();
  if (GOAL_WEIGHT_LEVELS.has(normalized)) return normalized;
  return fallback;
}

function weightScore(level) {
  return GOAL_WEIGHT_SCORE[toWeightLevel(level)] || GOAL_WEIGHT_SCORE.medium;
}

function isClosedQueueStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized === "done" || normalized === "carried";
}

function dateDiffDays(left, right) {
  const leftTime = Date.parse(`${left}T00:00:00Z`);
  const rightTime = Date.parse(`${right}T00:00:00Z`);
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return 0;
  return Math.floor((rightTime - leftTime) / 86400000);
}

function breakSecondsForMinutes(minutes) {
  const bounded = clampInt(minutes, 1, 6000, 30);
  if (bounded <= 30) return 5 * 60;
  if (bounded <= 90) return 10 * 60;
  return 15 * 60;
}

function effectiveRemainingSec(session, now = Date.now()) {
  const base = Math.max(0, asInt(session?.remaining_sec, 0));
  if (!session || asInt(session.running, 0) !== 1) return base;
  if (!session.started_at) return base;
  const startMs = Date.parse(session.started_at);
  if (Number.isNaN(startMs)) return base;
  const elapsed = Math.max(0, Math.floor((now - startMs) / 1000));
  return Math.max(0, base - elapsed);
}

function defaultSession(dateIso) {
  return {
    scope: SHARED_SCOPE,
    date: dateIso,
    mode: "task",
    active_entry_id: null,
    running: 0,
    started_at: null,
    remaining_sec: 0,
    break_sec: 0,
    state_version: 1,
    updated_at: nowIso(),
  };
}

async function readBody(request) {
  if (!request.body) return {};
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function assertDb(env) {
  if (env.DB && typeof env.DB.prepare === "function") return null;
  return json({ error: "db_not_configured", detail: "Missing D1 binding `DB`." }, 500);
}

function assertWriteKey(request, env) {
  if (!WRITE_METHODS.has(request.method.toUpperCase())) return null;
  const expected = String(env.WRITE_API_KEY || "").trim();
  if (!expected) {
    return json({ error: "write_key_not_configured", detail: "Missing env var `WRITE_API_KEY`." }, 500);
  }
  const provided = String(request.headers.get("x-write-key") || "").trim();
  if (!provided || provided !== expected) return json({ error: "forbidden" }, 403);
  return null;
}

async function listGoals(db) {
  const { results } = await db
    .prepare(
      `SELECT id, title, target_date, daily_hours, weight_level, created_at, updated_at
       FROM shared_goals
       WHERE scope = ?
       ORDER BY updated_at DESC, created_at DESC`
    )
    .bind(SHARED_SCOPE)
    .all();
  return (results || []).map((row) => ({
    ...row,
    weight_level: toWeightLevel(row.weight_level),
  }));
}

async function findGoal(db, id) {
  const { results } = await db
    .prepare(
      `SELECT id, title, target_date, daily_hours, weight_level, created_at, updated_at
       FROM shared_goals
       WHERE id = ? AND scope = ?
       LIMIT 1`
    )
    .bind(id, SHARED_SCOPE)
    .all();
  const row = (results || [])[0] || null;
  if (!row) return null;
  return {
    ...row,
    weight_level: toWeightLevel(row.weight_level),
  };
}

async function listTasks(db, goalId) {
  const query = goalId
    ? db
        .prepare(
          `SELECT id, goal_id, title, priority_rank, estimate_min, completed, created_at, updated_at
           FROM shared_tasks
           WHERE scope = ? AND goal_id = ?
           ORDER BY priority_rank ASC, created_at ASC`
        )
        .bind(SHARED_SCOPE, goalId)
    : db
        .prepare(
          `SELECT id, goal_id, title, priority_rank, estimate_min, completed, created_at, updated_at
           FROM shared_tasks
           WHERE scope = ?
           ORDER BY goal_id ASC, priority_rank ASC, created_at ASC`
        )
        .bind(SHARED_SCOPE);

  const { results } = await query.all();
  return results || [];
}

async function findTask(db, id) {
  const { results } = await db
    .prepare(
      `SELECT id, goal_id, title, priority_rank, estimate_min, completed, created_at, updated_at
       FROM shared_tasks
       WHERE id = ? AND scope = ?
       LIMIT 1`
    )
    .bind(id, SHARED_SCOPE)
    .all();
  return (results || [])[0] || null;
}

async function listScheduleForGoal(db, goalId) {
  const { results } = await db
    .prepare(
      `SELECT e.id, e.goal_id, e.task_id, e.title, e.date, e.minutes_allocated, e.order_index, e.created_at,
              t.title AS task_title,
              COALESCE(e.title, t.title, 'Task') AS display_title
       FROM schedule_entries e
       LEFT JOIN shared_tasks t ON t.id = e.task_id
       WHERE e.scope = ? AND e.goal_id = ?
       ORDER BY e.date ASC, e.order_index ASC, e.created_at ASC`
    )
    .bind(SHARED_SCOPE, goalId)
    .all();
  return results || [];
}

async function listEntryRefsByGoal(db, goalId) {
  const { results } = await db
    .prepare(
      `SELECT id, date
       FROM schedule_entries
       WHERE scope = ? AND goal_id = ?`
    )
    .bind(SHARED_SCOPE, goalId)
    .all();
  return (results || []).map((row) => ({ id: row.id, date: row.date }));
}

async function listEntryRefsByTask(db, taskId) {
  const { results } = await db
    .prepare(
      `SELECT id, date
       FROM schedule_entries
       WHERE scope = ? AND task_id = ?`
    )
    .bind(SHARED_SCOPE, taskId)
    .all();
  return (results || []).map((row) => ({ id: row.id, date: row.date }));
}

function uniqueDatesFromEntries(entries) {
  const dates = new Set();
  for (const entry of entries || []) {
    const dateIso = String(entry?.date || "").trim();
    if (DATE_PATTERN.test(dateIso)) dates.add(dateIso);
  }
  return [...dates].sort((a, b) => String(a).localeCompare(String(b)));
}

async function clearActiveSessionsForEntries(db, entries) {
  if (!entries.length) return;
  const stamp = nowIso();
  const updates = entries.map((entry) =>
    db
      .prepare(
        `UPDATE queue_session_state
         SET mode = 'task',
             active_entry_id = NULL,
             running = 0,
             started_at = NULL,
             remaining_sec = 0,
             break_sec = 0,
             state_version = state_version + 1,
             updated_at = ?
         WHERE scope = ? AND date = ? AND active_entry_id = ?`
      )
      .bind(stamp, SHARED_SCOPE, entry.date, entry.id)
  );
  await db.batch(updates);
}

async function deleteQueueStateForEntries(db, entries) {
  if (!entries.length) return;
  const deletes = entries.map((entry) =>
    db
      .prepare(`DELETE FROM queue_item_state WHERE scope = ? AND date = ? AND entry_id = ?`)
      .bind(SHARED_SCOPE, entry.date, entry.id)
  );
  await db.batch(deletes);
}

async function normalizeQueueDates(db, dates) {
  for (const dateIso of dates) {
    await normalizeQueueState(db, dateIso);
  }
}

async function clearUnscheduledForGoal(db, goalId, source = "") {
  const sourceFilter = String(source || "").trim();
  if (sourceFilter) {
    await db
      .prepare(`DELETE FROM unscheduled_entries WHERE scope = ? AND goal_id = ? AND source = ?`)
      .bind(SHARED_SCOPE, goalId, sourceFilter)
      .run();
    return;
  }
  await db.prepare(`DELETE FROM unscheduled_entries WHERE scope = ? AND goal_id = ?`).bind(SHARED_SCOPE, goalId).run();
}

async function insertUnscheduledEntry(db, row) {
  await db
    .prepare(
      `INSERT INTO unscheduled_entries
        (id, scope, goal_id, task_id, title, date, remaining_min, reason, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      row.id || crypto.randomUUID(),
      SHARED_SCOPE,
      row.goal_id,
      row.task_id || null,
      row.title || "Task",
      row.date,
      asInt(row.remaining_min, 0),
      row.reason || DEADLINE_CONFLICT_REASON,
      row.source || "spread",
      row.created_at || nowIso()
    )
    .run();
}

async function listUnscheduledEntries(db, fromDate, toDate) {
  const { results } = await db
    .prepare(
      `SELECT id, goal_id, task_id, title, date, remaining_min, reason, source, created_at
       FROM unscheduled_entries
       WHERE scope = ? AND date >= ? AND date <= ?
       ORDER BY date ASC, created_at ASC`
    )
    .bind(SHARED_SCOPE, fromDate, toDate)
    .all();
  return results || [];
}

async function logQueueEvent(db, dateIso, eventType, entryId = null, meta = null) {
  await db
    .prepare(
      `INSERT INTO queue_events (id, scope, date, event_type, entry_id, meta_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      SHARED_SCOPE,
      dateIso,
      String(eventType || "unknown"),
      entryId || null,
      meta ? JSON.stringify(meta) : null,
      nowIso()
    )
    .run();
}

async function listTimeline(db, fromDate, toDate) {
  const { results } = await db
    .prepare(
      `SELECT e.id AS entry_id,
              e.goal_id,
              g.title AS goal_title,
              g.target_date AS goal_target_date,
              g.daily_hours AS goal_daily_hours,
              g.weight_level AS goal_weight_level,
              e.task_id,
              COALESCE(e.title, t.title, 'Task') AS title,
              e.date,
              e.minutes_allocated,
              e.order_index,
              e.created_at,
              COALESCE(q.status, 'pending') AS queue_status
       FROM schedule_entries e
       JOIN shared_goals g ON g.id = e.goal_id AND g.scope = e.scope
       LEFT JOIN shared_tasks t ON t.id = e.task_id
       LEFT JOIN queue_item_state q ON q.scope = e.scope AND q.date = e.date AND q.entry_id = e.id
       WHERE e.scope = ? AND e.date >= ? AND e.date <= ?
       ORDER BY e.date ASC, e.order_index ASC, e.created_at ASC`
    )
    .bind(SHARED_SCOPE, fromDate, toDate)
    .all();

  const items = (results || []).map((row) => ({
    entry_id: row.entry_id,
    goal_id: row.goal_id,
    goal_title: row.goal_title,
    goal_target_date: row.goal_target_date,
    goal_daily_hours: asInt(row.goal_daily_hours, 2),
    goal_weight_level: toWeightLevel(row.goal_weight_level),
    task_id: row.task_id,
    title: row.title,
    date: row.date,
    minutes_allocated: asInt(row.minutes_allocated, 0),
    order_index: asInt(row.order_index, 0),
    queue_status: row.queue_status,
    entry_done: isClosedQueueStatus(row.queue_status),
  }));

  const stats = new Map();
  for (const item of items) {
    if (!stats.has(item.goal_id)) {
      stats.set(item.goal_id, {
        id: item.goal_id,
        title: item.goal_title,
        target_date: item.goal_target_date,
        daily_hours: item.goal_daily_hours,
        weight_level: item.goal_weight_level,
        total_min: 0,
        completed_min: 0,
      });
    }
    const stat = stats.get(item.goal_id);
    stat.total_min += item.minutes_allocated;
    if (item.entry_done) stat.completed_min += item.minutes_allocated;
  }

  const goals = [...stats.values()].sort((a, b) => String(a.title).localeCompare(String(b.title)));
  const unscheduled = await listUnscheduledEntries(db, fromDate, toDate);
  return { items, goals, unscheduled };
}

async function resolveTimelineTo(db, fromDate) {
  const fallback = addDays(fromDate, 30);
  const [maxScheduled, maxTarget] = await Promise.all([
    db.prepare(`SELECT MAX(date) AS max_date FROM schedule_entries WHERE scope = ?`).bind(SHARED_SCOPE).all(),
    db
      .prepare(`SELECT MAX(target_date) AS max_target_date FROM shared_goals WHERE scope = ? AND target_date IS NOT NULL`)
      .bind(SHARED_SCOPE)
      .all(),
  ]);

  let resolved = fallback;
  const scheduled = String((maxScheduled.results || [])[0]?.max_date || "").trim();
  const target = String((maxTarget.results || [])[0]?.max_target_date || "").trim();
  if (DATE_PATTERN.test(scheduled) && scheduled > resolved) resolved = scheduled;
  if (DATE_PATTERN.test(target) && target > resolved) resolved = target;
  return resolved;
}

async function getQueueSession(db, dateIso) {
  const { results } = await db
    .prepare(
      `SELECT scope, date, mode, active_entry_id, running, started_at, remaining_sec, break_sec, state_version, updated_at
       FROM queue_session_state
       WHERE scope = ? AND date = ?
       LIMIT 1`
    )
    .bind(SHARED_SCOPE, dateIso)
    .all();
  return (results || [])[0] || null;
}

async function compactTaskRanks(db, goalId) {
  const { results } = await db
    .prepare(
      `SELECT id, priority_rank
       FROM shared_tasks
       WHERE scope = ? AND goal_id = ?
       ORDER BY priority_rank ASC, created_at ASC`
    )
    .bind(SHARED_SCOPE, goalId)
    .all();

  const updates = [];
  const stamp = nowIso();
  for (let i = 0; i < (results || []).length; i += 1) {
    const row = results[i];
    const nextRank = i + 1;
    if (asInt(row.priority_rank, nextRank) === nextRank) continue;
    updates.push(
      db
        .prepare(`UPDATE shared_tasks SET priority_rank = ?, updated_at = ? WHERE id = ? AND scope = ?`)
        .bind(nextRank, stamp, row.id, SHARED_SCOPE)
    );
  }

  if (updates.length) await db.batch(updates);
}

async function saveQueueSession(db, dateIso, patch) {
  const previous = (await getQueueSession(db, dateIso)) || defaultSession(dateIso);
  const next = {
    ...previous,
    ...patch,
    scope: SHARED_SCOPE,
    date: dateIso,
    running: asInt(patch.running ?? previous.running, 0) ? 1 : 0,
    remaining_sec: Math.max(0, asInt(patch.remaining_sec ?? previous.remaining_sec, 0)),
    break_sec: Math.max(0, asInt(patch.break_sec ?? previous.break_sec, 0)),
    state_version: Math.max(1, asInt(patch.state_version ?? previous.state_version, 1)),
    updated_at: nowIso(),
  };

  await db
    .prepare(
      `INSERT INTO queue_session_state
        (scope, date, mode, active_entry_id, running, started_at, remaining_sec, break_sec, state_version, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(scope, date)
       DO UPDATE SET
         mode = excluded.mode,
         active_entry_id = excluded.active_entry_id,
         running = excluded.running,
         started_at = excluded.started_at,
         remaining_sec = excluded.remaining_sec,
         break_sec = excluded.break_sec,
         state_version = excluded.state_version,
         updated_at = excluded.updated_at`
    )
    .bind(
      next.scope,
      next.date,
      next.mode,
      next.active_entry_id,
      next.running,
      next.started_at,
      next.remaining_sec,
      next.break_sec,
      next.state_version,
      next.updated_at
    )
    .run();

  return next;
}

async function upsertQueueItemState(db, dateIso, entryId, patch = {}) {
  const { results } = await db
    .prepare(
      `SELECT scope, date, entry_id, status, remaining_sec, order_override, updated_at, completed_at
       FROM queue_item_state
       WHERE scope = ? AND date = ? AND entry_id = ?
       LIMIT 1`
    )
    .bind(SHARED_SCOPE, dateIso, entryId)
    .all();

  const prev = (results || [])[0] || {
    scope: SHARED_SCOPE,
    date: dateIso,
    entry_id: entryId,
    status: "pending",
    remaining_sec: null,
    order_override: null,
    completed_at: null,
    updated_at: nowIso(),
  };

  const next = {
    ...prev,
    ...patch,
    scope: SHARED_SCOPE,
    date: dateIso,
    entry_id: entryId,
    updated_at: nowIso(),
  };

  await db
    .prepare(
      `INSERT INTO queue_item_state
        (scope, date, entry_id, status, remaining_sec, order_override, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(scope, date, entry_id)
       DO UPDATE SET
         status = excluded.status,
         remaining_sec = excluded.remaining_sec,
         order_override = excluded.order_override,
         updated_at = excluded.updated_at,
         completed_at = excluded.completed_at`
    )
    .bind(
      next.scope,
      next.date,
      next.entry_id,
      next.status,
      next.remaining_sec,
      next.order_override,
      next.updated_at,
      next.completed_at
    )
    .run();

  return next;
}

async function fetchQueueRows(db, dateIso) {
  const { results } = await db
    .prepare(
      `SELECT e.id AS entry_id,
              e.goal_id,
              g.title AS goal_title,
              g.target_date AS goal_target_date,
              g.weight_level AS goal_weight_level,
              e.task_id,
              COALESCE(e.title, t.title, 'Task') AS title,
              e.date,
              e.minutes_allocated,
              e.order_index,
              e.created_at,
              t.estimate_min,
              COALESCE(q.status, 'pending') AS runtime_status,
              q.remaining_sec,
              q.order_override
       FROM schedule_entries e
       JOIN shared_goals g ON g.id = e.goal_id AND g.scope = e.scope
       LEFT JOIN shared_tasks t ON t.id = e.task_id
       LEFT JOIN queue_item_state q ON q.scope = e.scope AND q.date = e.date AND q.entry_id = e.id
       WHERE e.scope = ? AND e.date = ?
       ORDER BY COALESCE(q.order_override, e.order_index) ASC, e.created_at ASC`
    )
    .bind(SHARED_SCOPE, dateIso)
    .all();

  return (results || []).map((row) => ({
    entry_id: row.entry_id,
    goal_id: row.goal_id,
    goal_title: row.goal_title,
    goal_target_date: row.goal_target_date,
    goal_weight_level: toWeightLevel(row.goal_weight_level),
    task_id: row.task_id,
    title: row.title,
    date: row.date,
    minutes_allocated: asInt(row.minutes_allocated, 0),
    order_index: asInt(row.order_index, 0),
    estimate_min: asInt(row.estimate_min, asInt(row.minutes_allocated, 0)),
    runtime_status: row.runtime_status,
    remaining_sec: row.remaining_sec === null || row.remaining_sec === undefined ? null : asInt(row.remaining_sec, 0),
    order_override: row.order_override === null || row.order_override === undefined ? null : asInt(row.order_override, 0),
  }));
}

function entryPlannedSec(entry) {
  return Math.max(60, asInt(entry.minutes_allocated, 0) * 60);
}

function entryRemainingSec(entry) {
  if (entry.runtime_status === "done") return 0;
  if (entry.remaining_sec === null || entry.remaining_sec === undefined) return entryPlannedSec(entry);
  return Math.max(0, asInt(entry.remaining_sec, entryPlannedSec(entry)));
}

function firstPendingEntry(rows, excludeEntryId = "") {
  return rows.find((row) => !isClosedQueueStatus(row.runtime_status) && row.entry_id !== excludeEntryId) || null;
}

async function maybeMarkTaskComplete(db, taskId) {
  if (!taskId) return;

  const { results } = await db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM schedule_entries e
       LEFT JOIN queue_item_state q ON q.scope = e.scope AND q.date = e.date AND q.entry_id = e.id
       WHERE e.scope = ? AND e.task_id = ? AND COALESCE(q.status, 'pending') NOT IN ('done', 'carried')`
    )
    .bind(SHARED_SCOPE, taskId)
    .all();

  const count = asInt((results || [])[0]?.c, 0);
  if (count !== 0) return;

  await db
    .prepare(`UPDATE shared_tasks SET completed = 1, updated_at = ? WHERE id = ? AND scope = ?`)
    .bind(nowIso(), taskId, SHARED_SCOPE)
    .run();
}

async function completeEntryAndStartBreak(db, dateIso, entryId) {
  if (!entryId) return;

  const rows = await fetchQueueRows(db, dateIso);
  const entry = rows.find((row) => row.entry_id === entryId);
  if (!entry || entry.runtime_status === "done") return;

  await upsertQueueItemState(db, dateIso, entry.entry_id, {
    status: "done",
    remaining_sec: 0,
    completed_at: nowIso(),
  });

  await maybeMarkTaskComplete(db, entry.task_id);

  const nextRows = await fetchQueueRows(db, dateIso);
  const nextPending = firstPendingEntry(nextRows);
  const previousSession = (await getQueueSession(db, dateIso)) || defaultSession(dateIso);

  if (!nextPending) {
    await saveQueueSession(db, dateIso, {
      mode: "task",
      active_entry_id: null,
      running: 0,
      started_at: null,
      remaining_sec: 0,
      break_sec: 0,
      state_version: asInt(previousSession.state_version, 1) + 1,
    });
    return;
  }

  const breakSec = breakSecondsForMinutes(entry.estimate_min || entry.minutes_allocated);
  await saveQueueSession(db, dateIso, {
    mode: "break",
    active_entry_id: nextPending.entry_id,
    running: 1,
    started_at: nowIso(),
    remaining_sec: breakSec,
    break_sec: breakSec,
    state_version: asInt(previousSession.state_version, 1) + 1,
  });
}

async function normalizeQueueState(db, dateIso) {
  let session = (await getQueueSession(db, dateIso)) || defaultSession(dateIso);
  let rows = await fetchQueueRows(db, dateIso);

  if (session.running === 1) {
    const remaining = effectiveRemainingSec(session);
    if (remaining <= 0) {
      if (session.mode === "break") {
        session = await saveQueueSession(db, dateIso, {
          running: 0,
          started_at: null,
          remaining_sec: 0,
          state_version: asInt(session.state_version, 1) + 1,
        });
      } else if (session.mode === "task" && session.active_entry_id) {
        await completeEntryAndStartBreak(db, dateIso, session.active_entry_id);
        session = (await getQueueSession(db, dateIso)) || defaultSession(dateIso);
      }
      rows = await fetchQueueRows(db, dateIso);
    }
  }

  if (session.mode === "task") {
    const activeValid = session.active_entry_id
      ? rows.some((row) => row.entry_id === session.active_entry_id && !isClosedQueueStatus(row.runtime_status))
      : false;

    if (!activeValid) {
      const firstPending = firstPendingEntry(rows);
      if (firstPending) {
        session = await saveQueueSession(db, dateIso, {
          active_entry_id: firstPending.entry_id,
          running: 0,
          started_at: null,
          remaining_sec: entryRemainingSec(firstPending),
          break_sec: 0,
          mode: "task",
          state_version: asInt(session.state_version, 1) + 1,
        });
      } else if (session.active_entry_id || session.remaining_sec !== 0 || session.break_sec !== 0) {
        session = await saveQueueSession(db, dateIso, {
          active_entry_id: null,
          running: 0,
          started_at: null,
          remaining_sec: 0,
          break_sec: 0,
          mode: "task",
          state_version: asInt(session.state_version, 1) + 1,
        });
      }
    }
  }

  return { rows, session };
}

function buildQueuePayload(rows, session, dateIso) {
  const effectiveSessionRemaining = effectiveRemainingSec(session);
  const items = rows.map((row) => {
    const plannedSec = entryPlannedSec(row);
    let status = row.runtime_status;
    let remaining = entryRemainingSec(row);

    if (session.mode === "task" && session.active_entry_id === row.entry_id && !isClosedQueueStatus(row.runtime_status)) {
      status = session.running === 1 ? "running" : "paused";
      remaining = effectiveSessionRemaining;
    }

    return {
      entry_id: row.entry_id,
      goal_id: row.goal_id,
      goal_title: row.goal_title,
      goal_weight_level: row.goal_weight_level,
      goal_target_date: row.goal_target_date,
      task_id: row.task_id,
      title: row.title,
      date: row.date,
      minutes_allocated: row.minutes_allocated,
      order_index: row.order_override ?? row.order_index,
      status,
      planned_sec: plannedSec,
      remaining_sec: Math.max(0, remaining),
    };
  });

  return {
    date: dateIso,
    items,
    session: {
      mode: session.mode,
      active_entry_id: session.active_entry_id,
      running: asInt(session.running, 0),
      started_at: session.started_at,
      remaining_sec: effectiveSessionRemaining,
      break_sec: asInt(session.break_sec, 0),
      state_version: asInt(session.state_version, 1),
      updated_at: session.updated_at,
    },
  };
}

async function getQueuePayload(db, dateIso) {
  const normalized = await normalizeQueueState(db, dateIso);
  return buildQueuePayload(normalized.rows, normalized.session, dateIso);
}

async function startQueue(db, dateIso, entryId) {
  const { rows, session } = await normalizeQueueState(db, dateIso);

  if (session.mode === "break") {
    const remaining = effectiveRemainingSec(session);
    if (remaining <= 0) return json({ error: "break_finished_ack_required" }, 409);

    await saveQueueSession(db, dateIso, {
      running: 1,
      started_at: nowIso(),
      remaining_sec: remaining,
      state_version: asInt(session.state_version, 1) + 1,
    });
    return json(await getQueuePayload(db, dateIso));
  }

  const pendingRows = rows.filter((row) => !isClosedQueueStatus(row.runtime_status));
  if (!pendingRows.length) return json({ error: "no_pending_items" }, 400);

  let target = null;
  if (entryId) {
    target = pendingRows.find((row) => row.entry_id === entryId) || null;
    if (!target) return json({ error: "entry_not_found" }, 404);
  }

  if (!target && session.active_entry_id) {
    target = pendingRows.find((row) => row.entry_id === session.active_entry_id) || null;
  }

  if (!target) target = pendingRows[0];

  const remaining = entryRemainingSec(target);
  await upsertQueueItemState(db, dateIso, target.entry_id, {
    status: "pending",
    remaining_sec: remaining,
    completed_at: null,
  });

  await saveQueueSession(db, dateIso, {
    mode: "task",
    active_entry_id: target.entry_id,
    running: 1,
    started_at: nowIso(),
    remaining_sec: remaining,
    break_sec: 0,
    state_version: asInt(session.state_version, 1) + 1,
  });
  await logQueueEvent(db, dateIso, "start_task", target.entry_id, { mode: "task" });

  return json(await getQueuePayload(db, dateIso));
}

async function pauseQueue(db, dateIso) {
  const { rows, session } = await normalizeQueueState(db, dateIso);
  if (session.running !== 1) return json(buildQueuePayload(rows, session, dateIso));

  const remaining = effectiveRemainingSec(session);

  if (session.mode === "task" && session.active_entry_id) {
    await upsertQueueItemState(db, dateIso, session.active_entry_id, {
      status: "pending",
      remaining_sec: remaining,
      completed_at: null,
    });
  }

  await saveQueueSession(db, dateIso, {
    running: 0,
    started_at: null,
    remaining_sec: remaining,
    state_version: asInt(session.state_version, 1) + 1,
  });
  await logQueueEvent(db, dateIso, "pause_task", session.active_entry_id || null, { mode: session.mode });

  return json(await getQueuePayload(db, dateIso));
}

async function skipQueue(db, dateIso) {
  const { rows, session } = await normalizeQueueState(db, dateIso);
  if (session.mode === "break") return json({ error: "cannot_skip_during_break" }, 409);

  const active = session.active_entry_id
    ? rows.find((row) => row.entry_id === session.active_entry_id && !isClosedQueueStatus(row.runtime_status))
    : firstPendingEntry(rows);

  if (!active) return json({ error: "no_pending_items" }, 400);

  const maxOrder = rows.reduce((max, row) => Math.max(max, row.order_override ?? row.order_index), 0);
  await upsertQueueItemState(db, dateIso, active.entry_id, {
    status: "pending",
    remaining_sec: entryPlannedSec(active),
    order_override: maxOrder + 1,
    completed_at: null,
  });

  const nextRows = await fetchQueueRows(db, dateIso);
  const nextPending = firstPendingEntry(nextRows, active.entry_id);

  await saveQueueSession(db, dateIso, {
    mode: "task",
    active_entry_id: nextPending?.entry_id || null,
    running: 0,
    started_at: null,
    remaining_sec: nextPending ? entryRemainingSec(nextPending) : 0,
    break_sec: 0,
    state_version: asInt(session.state_version, 1) + 1,
  });
  await logQueueEvent(db, dateIso, "skip_task", active.entry_id, { mode: "task" });

  return json(await getQueuePayload(db, dateIso));
}

async function reorderQueue(db, dateIso, entryId, direction) {
  const { rows, session } = await normalizeQueueState(db, dateIso);
  const dir = direction === "up" ? "up" : direction === "down" ? "down" : "";
  if (!dir) return json({ error: "direction_required" }, 400);
  if (!entryId) return json({ error: "entry_id_required" }, 400);

  const pending = rows.filter((row) => !isClosedQueueStatus(row.runtime_status));
  const index = pending.findIndex((row) => row.entry_id === entryId);
  if (index === -1) return json({ error: "entry_not_found" }, 404);
  if (session.active_entry_id === entryId) return json({ error: "active_item_locked" }, 409);

  const targetIndex = dir === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= pending.length) return json(await getQueuePayload(db, dateIso));
  if (session.active_entry_id === pending[targetIndex].entry_id) return json({ error: "active_item_locked" }, 409);

  const current = pending[index];
  const swapped = pending[targetIndex];
  const currentOrder = current.order_override ?? current.order_index;
  const swappedOrder = swapped.order_override ?? swapped.order_index;

  await Promise.all([
    upsertQueueItemState(db, dateIso, current.entry_id, { order_override: swappedOrder }),
    upsertQueueItemState(db, dateIso, swapped.entry_id, { order_override: currentOrder }),
  ]);

  await logQueueEvent(db, dateIso, "reorder_pending", entryId, { direction: dir });
  return json(await getQueuePayload(db, dateIso));
}

async function completeQueue(db, dateIso) {
  const { rows, session } = await normalizeQueueState(db, dateIso);
  if (session.mode === "break") return json({ error: "cannot_complete_during_break" }, 409);

  const active = session.active_entry_id
    ? rows.find((row) => row.entry_id === session.active_entry_id && !isClosedQueueStatus(row.runtime_status))
    : firstPendingEntry(rows);

  if (!active) return json({ error: "no_pending_items" }, 400);

  await completeEntryAndStartBreak(db, dateIso, active.entry_id);
  await logQueueEvent(db, dateIso, "complete_task", active.entry_id, { mode: "task" });
  return json(await getQueuePayload(db, dateIso));
}

async function ackBreak(db, dateIso, skipBreak) {
  const { rows, session } = await normalizeQueueState(db, dateIso);
  if (session.mode !== "break") return json(buildQueuePayload(rows, session, dateIso));

  const remaining = effectiveRemainingSec(session);
  if (remaining > 0 && !skipBreak) {
    return json({ error: "break_not_finished", remaining_sec: remaining }, 409);
  }

  const pendingRows = rows.filter((row) => !isClosedQueueStatus(row.runtime_status));
  const targeted = session.active_entry_id ? pendingRows.find((row) => row.entry_id === session.active_entry_id) : null;
  const next = targeted || pendingRows[0] || null;

  await saveQueueSession(db, dateIso, {
    mode: "task",
    active_entry_id: next?.entry_id || null,
    running: 0,
    started_at: null,
    remaining_sec: next ? entryRemainingSec(next) : 0,
    break_sec: 0,
    state_version: asInt(session.state_version, 1) + 1,
  });
  await logQueueEvent(db, dateIso, skipBreak ? "skip_break" : "ack_break", session.active_entry_id || null, {
    mode: "break",
    skip_break: Boolean(skipBreak),
  });

  return json(await getQueuePayload(db, dateIso));
}

async function spreadGoal(db, payload) {
  const goalId = String(payload.goal_id || "").trim();
  if (!goalId) return json({ error: "goal_id_required" }, 400);

  const goal = await findGoal(db, goalId);
  if (!goal) return json({ error: "goal_not_found" }, 404);

  const startMode = payload.start_mode === "tomorrow" ? "tomorrow" : "today";
  const clientToday = asDateOrNull(payload.client_today) || todayIso();
  const startDate = startMode === "tomorrow" ? addDays(clientToday, 1) : clientToday;
  const targetDate = asDateOrNull(payload.target_date) || asDateOrNull(goal.target_date);
  const dailyBudget = clampInt(goal.daily_hours, 1, 16, 2) * 60;

  const tasks = (await listTasks(db, goalId)).filter((task) => Number(task.completed) !== 1);
  await clearUnscheduledForGoal(db, goalId, "spread");

  const oldEntriesResult = await db
    .prepare(`SELECT id, date FROM schedule_entries WHERE scope = ? AND goal_id = ?`)
    .bind(SHARED_SCOPE, goalId)
    .all();
  const oldEntries = oldEntriesResult.results || [];

  const rows = [db.prepare("DELETE FROM schedule_entries WHERE scope = ? AND goal_id = ?").bind(SHARED_SCOPE, goalId)];
  for (const oldEntry of oldEntries) {
    rows.push(
      db
        .prepare(`DELETE FROM queue_item_state WHERE scope = ? AND date = ? AND entry_id = ?`)
        .bind(SHARED_SCOPE, oldEntry.date, oldEntry.id)
    );
  }
  const overflow = [];

  if (!tasks.length) {
    const entry = {
      id: crypto.randomUUID(),
      goal_id: goalId,
      task_id: null,
      title: `Goal Focus: ${goal.title}`,
      date: startDate,
      minutes_allocated: dailyBudget,
      order_index: 1,
      created_at: nowIso(),
    };
    rows.push(
      db
        .prepare(
          `INSERT INTO schedule_entries (id, scope, goal_id, task_id, title, date, minutes_allocated, order_index, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          entry.id,
          SHARED_SCOPE,
          entry.goal_id,
          entry.task_id,
          entry.title,
          entry.date,
          entry.minutes_allocated,
          entry.order_index,
          entry.created_at
        )
    );
  }

  let day = startDate;
  let dayRemaining = dailyBudget;
  let orderIndex = 1;

  for (const task of tasks) {
    let remaining = clampInt(task.estimate_min, 5, 6000, 60);

    while (remaining > 0) {
      if (targetDate && day > targetDate) {
        const blocked = {
          task_id: task.id,
          title: task.title,
          remaining_min: remaining,
          reason: DEADLINE_CONFLICT_REASON,
        };
        overflow.push(blocked);
        await insertUnscheduledEntry(db, {
          id: crypto.randomUUID(),
          goal_id: goalId,
          task_id: task.id,
          title: task.title,
          date: day,
          remaining_min: remaining,
          reason: DEADLINE_CONFLICT_REASON,
          source: "spread",
          created_at: nowIso(),
        });
        break;
      }

      if (dayRemaining <= 0) {
        day = addDays(day, 1);
        dayRemaining = dailyBudget;
        continue;
      }

      const minutes = Math.min(remaining, dayRemaining);
      const entry = {
        id: crypto.randomUUID(),
        goal_id: goalId,
        task_id: task.id,
        title: task.title,
        date: day,
        minutes_allocated: minutes,
        order_index: orderIndex,
        created_at: nowIso(),
      };

      rows.push(
        db
          .prepare(
            `INSERT INTO schedule_entries (id, scope, goal_id, task_id, title, date, minutes_allocated, order_index, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            entry.id,
            SHARED_SCOPE,
            entry.goal_id,
            entry.task_id,
            entry.title,
            entry.date,
            entry.minutes_allocated,
            entry.order_index,
            entry.created_at
          )
      );

      remaining -= minutes;
      dayRemaining -= minutes;
      orderIndex += 1;

      if (dayRemaining <= 0) {
        day = addDays(day, 1);
        dayRemaining = dailyBudget;
      }
    }
  }

  await db.batch(rows);

  return json({
    goal_id: goalId,
    start_date: startDate,
    target_date: targetDate || null,
    items: await listScheduleForGoal(db, goalId),
    overflow,
  });
}

async function deleteTaskCascade(db, taskId) {
  const task = await findTask(db, taskId);
  if (!task) return null;

  const entries = await listEntryRefsByTask(db, taskId);
  const affectedDates = uniqueDatesFromEntries(entries);

  await clearActiveSessionsForEntries(db, entries);
  await deleteQueueStateForEntries(db, entries);

  await db.batch([
    db.prepare(`DELETE FROM schedule_entries WHERE scope = ? AND task_id = ?`).bind(SHARED_SCOPE, taskId),
    db.prepare(`DELETE FROM unscheduled_entries WHERE scope = ? AND task_id = ?`).bind(SHARED_SCOPE, taskId),
    db.prepare(`DELETE FROM shared_tasks WHERE id = ? AND scope = ?`).bind(taskId, SHARED_SCOPE),
  ]);

  await compactTaskRanks(db, task.goal_id);
  await normalizeQueueDates(db, affectedDates);

  return {
    deleted_task_id: taskId,
    goal_id: task.goal_id,
    affected_dates: affectedDates,
  };
}

async function deleteGoalCascade(db, goalId) {
  const goal = await findGoal(db, goalId);
  if (!goal) return null;

  const [entries, tasksResult] = await Promise.all([
    listEntryRefsByGoal(db, goalId),
    db.prepare(`SELECT COUNT(*) AS c FROM shared_tasks WHERE scope = ? AND goal_id = ?`).bind(SHARED_SCOPE, goalId).all(),
  ]);
  const affectedDates = uniqueDatesFromEntries(entries);

  await clearActiveSessionsForEntries(db, entries);
  await deleteQueueStateForEntries(db, entries);

  await db.batch([
    db.prepare(`DELETE FROM schedule_entries WHERE scope = ? AND goal_id = ?`).bind(SHARED_SCOPE, goalId),
    db.prepare(`DELETE FROM unscheduled_entries WHERE scope = ? AND goal_id = ?`).bind(SHARED_SCOPE, goalId),
    db.prepare(`DELETE FROM shared_tasks WHERE scope = ? AND goal_id = ?`).bind(SHARED_SCOPE, goalId),
    db.prepare(`DELETE FROM shared_goals WHERE id = ? AND scope = ?`).bind(goalId, SHARED_SCOPE),
  ]);

  await normalizeQueueDates(db, affectedDates);

  return {
    deleted_goal_id: goalId,
    affected_dates: affectedDates,
    deleted_task_count: asInt((tasksResult.results || [])[0]?.c, 0),
  };
}

function isCriticalGoal(goal, dateIso) {
  if (toWeightLevel(goal?.weight_level) === "high") return true;
  const target = asDateOrNull(goal?.target_date);
  if (!target) return false;
  const daysLeft = dateDiffDays(dateIso, target);
  return daysLeft <= 2;
}

function isFocusEntry(row) {
  if (row.task_id) return false;
  return String(row.title || "").toLowerCase().startsWith("goal focus:");
}

function rolloverCandidateSort(a, b, dateIso) {
  const aCritical = isCriticalGoal(a, dateIso) ? 1 : 0;
  const bCritical = isCriticalGoal(b, dateIso) ? 1 : 0;
  if (aCritical !== bCritical) return bCritical - aCritical;

  const aFocusBoost = !aCritical && isFocusEntry(a) ? 1 : 0;
  const bFocusBoost = !bCritical && isFocusEntry(b) ? 1 : 0;
  if (aFocusBoost !== bFocusBoost) return bFocusBoost - aFocusBoost;

  const aWeight = weightScore(a.weight_level);
  const bWeight = weightScore(b.weight_level);
  if (aWeight !== bWeight) return bWeight - aWeight;

  const aTarget = asDateOrNull(a.target_date) || "9999-12-31";
  const bTarget = asDateOrNull(b.target_date) || "9999-12-31";
  if (aTarget !== bTarget) return String(aTarget).localeCompare(String(bTarget));

  const aPriority = asInt(a.priority_rank, 999999);
  const bPriority = asInt(b.priority_rank, 999999);
  if (aPriority !== bPriority) return aPriority - bPriority;

  if (a.date !== b.date) return String(a.date).localeCompare(String(b.date));
  return asInt(a.order_index, 0) - asInt(b.order_index, 0);
}

async function getRolloverRun(db, dateIso) {
  const { results } = await db
    .prepare(
      `SELECT date, carried_count, unscheduled_count, banner_message, created_at
       FROM rollover_runs
       WHERE scope = ? AND date = ?
       LIMIT 1`
    )
    .bind(SHARED_SCOPE, dateIso)
    .all();
  return (results || [])[0] || null;
}

async function saveRolloverRun(db, dateIso, carriedCount, unscheduledCount, bannerMessage) {
  await db
    .prepare(
      `INSERT INTO rollover_runs (scope, date, carried_count, unscheduled_count, banner_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(scope, date)
       DO UPDATE SET
         carried_count = excluded.carried_count,
         unscheduled_count = excluded.unscheduled_count,
         banner_message = excluded.banner_message,
         created_at = excluded.created_at`
    )
    .bind(SHARED_SCOPE, dateIso, carriedCount, unscheduledCount, bannerMessage, nowIso())
    .run();
}

async function listRolloverConflictsForDate(db, dateIso) {
  const { results } = await db
    .prepare(
      `SELECT id, goal_id, task_id, title, date, remaining_min, reason, source, created_at
       FROM unscheduled_entries
       WHERE scope = ? AND date = ? AND source = 'rollover'
       ORDER BY created_at ASC`
    )
    .bind(SHARED_SCOPE, dateIso)
    .all();
  return results || [];
}

async function appOpenRollover(db, dateIso) {
  const existing = await getRolloverRun(db, dateIso);
  if (existing) {
    return {
      carried_count: asInt(existing.carried_count, 0),
      unscheduled_count: asInt(existing.unscheduled_count, 0),
      banner_message: existing.banner_message || "Rollover already applied.",
      conflicts: await listRolloverConflictsForDate(db, dateIso),
      already_applied: true,
      date: dateIso,
    };
  }

  await db
    .prepare(`DELETE FROM unscheduled_entries WHERE scope = ? AND date = ? AND source = 'rollover'`)
    .bind(SHARED_SCOPE, dateIso)
    .run();

  const [entriesResult, usageResult] = await Promise.all([
    db
      .prepare(
        `SELECT e.id AS entry_id,
                e.goal_id,
                e.task_id,
                e.title,
                e.date,
                e.minutes_allocated,
                e.order_index,
                g.title AS goal_title,
                g.target_date,
                g.daily_hours,
                g.weight_level,
                t.priority_rank,
                q.remaining_sec,
                COALESCE(q.status, 'pending') AS queue_status
         FROM schedule_entries e
         JOIN shared_goals g ON g.id = e.goal_id AND g.scope = e.scope
         LEFT JOIN shared_tasks t ON t.id = e.task_id
         LEFT JOIN queue_item_state q ON q.scope = e.scope AND q.date = e.date AND q.entry_id = e.id
         WHERE e.scope = ? AND e.date < ? AND COALESCE(q.status, 'pending') NOT IN ('done', 'carried')
         ORDER BY e.date ASC, e.order_index ASC, e.created_at ASC`
      )
      .bind(SHARED_SCOPE, dateIso)
      .all(),
    db
      .prepare(
        `SELECT goal_id,
                SUM(minutes_allocated) AS used_min,
                MAX(order_index) AS max_order
         FROM schedule_entries
         WHERE scope = ? AND date = ?
         GROUP BY goal_id`
      )
      .bind(SHARED_SCOPE, dateIso)
      .all(),
  ]);

  const carryCandidates = (entriesResult.results || []).sort((a, b) => rolloverCandidateSort(a, b, dateIso));
  const goalUsage = new Map();
  let maxOrder = 0;
  for (const row of usageResult.results || []) {
    goalUsage.set(row.goal_id, asInt(row.used_min, 0));
    maxOrder = Math.max(maxOrder, asInt(row.max_order, 0));
  }

  const insertRows = [];
  const conflicts = [];
  let carriedCount = 0;

  for (const item of carryCandidates) {
    const remainingSec = item.remaining_sec === null || item.remaining_sec === undefined ? null : asInt(item.remaining_sec, 0);
    const remainingMinRaw = remainingSec === null ? asInt(item.minutes_allocated, 0) : Math.max(1, Math.ceil(remainingSec / 60));
    if (remainingMinRaw <= 0) continue;

    const targetDate = asDateOrNull(item.target_date);
    if (targetDate && dateIso > targetDate) {
      const blocked = {
        id: crypto.randomUUID(),
        goal_id: item.goal_id,
        task_id: item.task_id,
        title: item.title,
        date: dateIso,
        remaining_min: remainingMinRaw,
        reason: DEADLINE_CONFLICT_REASON,
        source: "rollover",
        created_at: nowIso(),
      };
      conflicts.push(blocked);
      await insertUnscheduledEntry(db, blocked);
      await upsertQueueItemState(db, item.date, item.entry_id, {
        status: "carried",
        remaining_sec: 0,
        completed_at: nowIso(),
      });
      continue;
    }

    const goalDaily = clampInt(item.daily_hours, 1, 16, 2) * 60;
    const usedMin = asInt(goalUsage.get(item.goal_id), 0);
    const availableMin = Math.max(0, goalDaily - usedMin);
    if (availableMin <= 0) {
      const limited = {
        id: crypto.randomUUID(),
        goal_id: item.goal_id,
        task_id: item.task_id,
        title: item.title,
        date: dateIso,
        remaining_min: remainingMinRaw,
        reason: "daily_capacity",
        source: "rollover",
        created_at: nowIso(),
      };
      conflicts.push(limited);
      await insertUnscheduledEntry(db, limited);
      continue;
    }

    const allocatedMin = Math.min(remainingMinRaw, availableMin);
    maxOrder += 1;
    insertRows.push(
      db
        .prepare(
          `INSERT INTO schedule_entries (id, scope, goal_id, task_id, title, date, minutes_allocated, order_index, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          SHARED_SCOPE,
          item.goal_id,
          item.task_id || null,
          item.title,
          dateIso,
          allocatedMin,
          maxOrder,
          nowIso()
        )
    );
    carriedCount += 1;
    goalUsage.set(item.goal_id, usedMin + allocatedMin);

    const remainingAfterCarry = remainingMinRaw - allocatedMin;
    if (remainingAfterCarry <= 0) {
      await upsertQueueItemState(db, item.date, item.entry_id, {
        status: "carried",
        remaining_sec: 0,
        completed_at: nowIso(),
      });
    } else {
      await upsertQueueItemState(db, item.date, item.entry_id, {
        status: "pending",
        remaining_sec: remainingAfterCarry * 60,
        completed_at: null,
      });
      const partial = {
        id: crypto.randomUUID(),
        goal_id: item.goal_id,
        task_id: item.task_id,
        title: item.title,
        date: dateIso,
        remaining_min: remainingAfterCarry,
        reason: "daily_capacity",
        source: "rollover",
        created_at: nowIso(),
      };
      conflicts.push(partial);
      await insertUnscheduledEntry(db, partial);
    }
  }

  if (insertRows.length) {
    await db.batch(insertRows);
  }

  const unscheduledCount = conflicts.length;
  const bannerMessage = `Rollover applied: ${carriedCount} carried, ${unscheduledCount} unscheduled.`;
  await saveRolloverRun(db, dateIso, carriedCount, unscheduledCount, bannerMessage);
  await normalizeQueueState(db, dateIso);

  return {
    carried_count: carriedCount,
    unscheduled_count: unscheduledCount,
    banner_message: bannerMessage,
    conflicts,
    already_applied: false,
    date: dateIso,
  };
}

function rangeDates(fromDate, toDate) {
  const out = [];
  let cursor = fromDate;
  while (cursor <= toDate) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

async function analyticsRange(db, fromDate, toDate) {
  const safeFrom = asDateOrDefault(fromDate, todayIso());
  const safeToRaw = asDateOrDefault(toDate, safeFrom);
  const safeTo = safeToRaw >= safeFrom ? safeToRaw : safeFrom;

  const [planned, completed, events, rollover, goalRows, pendingRows] = await Promise.all([
    db
      .prepare(
        `SELECT date, SUM(minutes_allocated) AS planned_min
         FROM schedule_entries
         WHERE scope = ? AND date >= ? AND date <= ?
         GROUP BY date`
      )
      .bind(SHARED_SCOPE, safeFrom, safeTo)
      .all(),
    db
      .prepare(
        `SELECT e.date, SUM(e.minutes_allocated) AS completed_min
         FROM schedule_entries e
         LEFT JOIN queue_item_state q ON q.scope = e.scope AND q.date = e.date AND q.entry_id = e.id
         WHERE e.scope = ? AND e.date >= ? AND e.date <= ? AND COALESCE(q.status, 'pending') = 'done'
         GROUP BY e.date`
      )
      .bind(SHARED_SCOPE, safeFrom, safeTo)
      .all(),
    db
      .prepare(
        `SELECT date, event_type, COUNT(*) AS c
         FROM queue_events
         WHERE scope = ? AND date >= ? AND date <= ?
         GROUP BY date, event_type`
      )
      .bind(SHARED_SCOPE, safeFrom, safeTo)
      .all(),
    db
      .prepare(
        `SELECT date, carried_count, unscheduled_count
         FROM rollover_runs
         WHERE scope = ? AND date >= ? AND date <= ?`
      )
      .bind(SHARED_SCOPE, safeFrom, safeTo)
      .all(),
    db
      .prepare(
        `SELECT g.id, g.title, g.target_date, g.daily_hours, g.weight_level,
                COALESCE(SUM(e.minutes_allocated), 0) AS planned_min,
                COALESCE(SUM(CASE WHEN COALESCE(q.status, 'pending') = 'done' THEN e.minutes_allocated ELSE 0 END), 0) AS completed_min
         FROM shared_goals g
         LEFT JOIN schedule_entries e ON e.scope = g.scope AND e.goal_id = g.id AND e.date >= ? AND e.date <= ?
         LEFT JOIN queue_item_state q ON q.scope = e.scope AND q.date = e.date AND q.entry_id = e.id
         WHERE g.scope = ?
         GROUP BY g.id, g.title, g.target_date, g.daily_hours, g.weight_level
         ORDER BY g.title ASC`
      )
      .bind(safeFrom, safeTo, SHARED_SCOPE)
      .all(),
    db
      .prepare(
        `SELECT e.goal_id, COALESCE(SUM(e.minutes_allocated), 0) AS pending_min
         FROM schedule_entries e
         LEFT JOIN queue_item_state q ON q.scope = e.scope AND q.date = e.date AND q.entry_id = e.id
         WHERE e.scope = ? AND COALESCE(q.status, 'pending') NOT IN ('done', 'carried')
         GROUP BY e.goal_id`
      )
      .bind(SHARED_SCOPE)
      .all(),
  ]);

  const plannedMap = new Map((planned.results || []).map((row) => [row.date, asInt(row.planned_min, 0)]));
  const completedMap = new Map((completed.results || []).map((row) => [row.date, asInt(row.completed_min, 0)]));
  const rolloverMap = new Map(
    (rollover.results || []).map((row) => [row.date, { carried: asInt(row.carried_count, 0), unscheduled: asInt(row.unscheduled_count, 0) }])
  );

  const eventsMap = new Map();
  for (const row of events.results || []) {
    if (!eventsMap.has(row.date)) eventsMap.set(row.date, {});
    eventsMap.get(row.date)[row.event_type] = asInt(row.c, 0);
  }

  const series = rangeDates(safeFrom, safeTo).map((date) => {
    const byType = eventsMap.get(date) || {};
    const rolloverDay = rolloverMap.get(date) || { carried: 0, unscheduled: 0 };
    return {
      date,
      planned_min: plannedMap.get(date) || 0,
      completed_min: completedMap.get(date) || 0,
      start_count: asInt(byType.start_task, 0),
      pause_count: asInt(byType.pause_task, 0),
      skip_count: asInt(byType.skip_task, 0),
      complete_count: asInt(byType.complete_task, 0),
      break_skip_count: asInt(byType.skip_break, 0),
      break_ack_count: asInt(byType.ack_break, 0),
      carried_count: asInt(rolloverDay.carried, 0),
      unscheduled_count: asInt(rolloverDay.unscheduled, 0),
    };
  });

  const pendingMap = new Map((pendingRows.results || []).map((row) => [row.goal_id, asInt(row.pending_min, 0)]));
  const goals = (goalRows.results || []).map((row) => {
    const targetDate = asDateOrNull(row.target_date);
    const pendingMin = pendingMap.get(row.id) || 0;
    const daysLeft = targetDate ? dateDiffDays(todayIso(), targetDate) : null;
    const capacityWindow = targetDate ? Math.max(1, (daysLeft < 0 ? 0 : daysLeft + 1) * clampInt(row.daily_hours, 1, 16, 2) * 60) : null;
    let risk_level = "none";
    if (targetDate) {
      if (daysLeft < 0 && pendingMin > 0) risk_level = "overdue";
      else if (capacityWindow !== null && pendingMin > capacityWindow) risk_level = "high";
      else if (daysLeft <= 7) risk_level = "medium";
      else risk_level = "low";
    }
    return {
      id: row.id,
      title: row.title,
      target_date: targetDate,
      daily_hours: clampInt(row.daily_hours, 1, 16, 2),
      weight_level: toWeightLevel(row.weight_level),
      planned_min: asInt(row.planned_min, 0),
      completed_min: asInt(row.completed_min, 0),
      pending_min: pendingMin,
      risk_level,
    };
  });

  return {
    from: safeFrom,
    to: safeTo,
    series,
    goals,
  };
}

function idFromQuery(url) {
  return String(url.searchParams.get("id") || "").trim();
}

function queueDateFrom(raw) {
  return asDateOrDefault(raw, todayIso());
}

async function handleApi(request, url, env) {
  const method = request.method.toUpperCase();
  const path = url.pathname;

  const dbErr = assertDb(env);
  if (dbErr) return dbErr;

  if (path === "/api/health" && method === "GET") {
    return json({ ok: true, mode: "d1-shared", db: true, write_key: Boolean(env.WRITE_API_KEY) });
  }

  const writeErr = assertWriteKey(request, env);
  if (writeErr) return writeErr;

  const db = env.DB;

  if (path === "/api/goals") {
    if (method === "GET") {
      return json({ items: await listGoals(db) });
    }

    if (method === "POST") {
      const body = await readBody(request);
      const title = String(body.title || "").trim();
      if (!title) return json({ error: "title_required" }, 400);

      const row = {
        id: crypto.randomUUID(),
        title,
        target_date: asDateOrNull(body.target_date),
        daily_hours: clampInt(body.daily_hours, 1, 16, 2),
        weight_level: toWeightLevel(body.weight_level),
        created_at: nowIso(),
        updated_at: nowIso(),
      };

      await db
        .prepare(
          `INSERT INTO shared_goals (id, scope, title, target_date, daily_hours, weight_level, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          row.id,
          SHARED_SCOPE,
          row.title,
          row.target_date,
          row.daily_hours,
          row.weight_level,
          row.created_at,
          row.updated_at
        )
        .run();

      return json({ item: row });
    }

    if (method === "PATCH") {
      const body = await readBody(request);
      const id = String(body.id || "").trim();
      if (!id) return json({ error: "id_required" }, 400);

      const prev = await findGoal(db, id);
      if (!prev) return json({ error: "goal_not_found" }, 404);

      const next = {
        ...prev,
        title: body.title !== undefined ? String(body.title || "").trim() || prev.title : prev.title,
        target_date: body.target_date !== undefined ? asDateOrNull(body.target_date) : prev.target_date,
        daily_hours:
          body.daily_hours !== undefined ? clampInt(body.daily_hours, 1, 16, prev.daily_hours || 2) : prev.daily_hours,
        weight_level: body.weight_level !== undefined ? toWeightLevel(body.weight_level, prev.weight_level) : prev.weight_level,
        updated_at: nowIso(),
      };

      await db
        .prepare(
          `UPDATE shared_goals
           SET title = ?, target_date = ?, daily_hours = ?, weight_level = ?, updated_at = ?
           WHERE id = ? AND scope = ?`
        )
        .bind(next.title, next.target_date, next.daily_hours, next.weight_level, next.updated_at, id, SHARED_SCOPE)
        .run();

      return json({ item: next });
    }

    if (method === "DELETE") {
      const id = idFromQuery(url);
      if (!id) return json({ error: "id_required" }, 400);
      const result = await deleteGoalCascade(db, id);
      if (!result) return json({ error: "goal_not_found" }, 404);
      return json(result);
    }
  }

  if (path === "/api/tasks") {
    if (method === "GET") {
      const goalId = String(url.searchParams.get("goal_id") || "").trim() || null;
      return json({ items: await listTasks(db, goalId) });
    }

    if (method === "POST") {
      const body = await readBody(request);
      const goalId = String(body.goal_id || "").trim();
      const title = String(body.title || "").trim();
      if (!goalId) return json({ error: "goal_id_required" }, 400);
      if (!title) return json({ error: "title_required" }, 400);

      const goal = await findGoal(db, goalId);
      if (!goal) return json({ error: "goal_not_found" }, 404);

      const row = {
        id: crypto.randomUUID(),
        goal_id: goalId,
        title,
        priority_rank: clampInt(body.priority_rank, 1, 999, 999),
        estimate_min: clampInt(body.estimate_min, 5, 6000, 60),
        completed: body.completed ? 1 : 0,
        created_at: nowIso(),
        updated_at: nowIso(),
      };

      await db
        .prepare(
          `INSERT INTO shared_tasks (id, scope, goal_id, title, priority_rank, estimate_min, completed, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          row.id,
          SHARED_SCOPE,
          row.goal_id,
          row.title,
          row.priority_rank,
          row.estimate_min,
          row.completed,
          row.created_at,
          row.updated_at
        )
        .run();

      return json({ item: row });
    }

    if (method === "PATCH") {
      const body = await readBody(request);
      const id = String(body.id || "").trim();
      if (!id) return json({ error: "id_required" }, 400);

      const prev = await findTask(db, id);
      if (!prev) return json({ error: "task_not_found" }, 404);

      const next = {
        ...prev,
        title: body.title !== undefined ? String(body.title || "").trim() || prev.title : prev.title,
        priority_rank:
          body.priority_rank !== undefined
            ? clampInt(body.priority_rank, 1, 999, prev.priority_rank || 1)
            : prev.priority_rank,
        estimate_min:
          body.estimate_min !== undefined ? clampInt(body.estimate_min, 5, 6000, prev.estimate_min || 60) : prev.estimate_min,
        completed: body.completed !== undefined ? (body.completed ? 1 : 0) : prev.completed,
        updated_at: nowIso(),
      };

      await db
        .prepare(
          `UPDATE shared_tasks
           SET title = ?, priority_rank = ?, estimate_min = ?, completed = ?, updated_at = ?
           WHERE id = ? AND scope = ?`
        )
        .bind(next.title, next.priority_rank, next.estimate_min, next.completed, next.updated_at, id, SHARED_SCOPE)
        .run();

      return json({ item: next });
    }

    if (method === "DELETE") {
      const id = idFromQuery(url);
      if (!id) return json({ error: "id_required" }, 400);
      const result = await deleteTaskCascade(db, id);
      if (!result) return json({ error: "task_not_found" }, 404);
      return json(result);
    }
  }

  if (path === "/api/schedule/spread" && method === "POST") {
    const body = await readBody(request);
    return spreadGoal(db, body);
  }

  if (path === "/api/schedule/goal" && method === "GET") {
    const goalId = String(url.searchParams.get("goal_id") || "").trim();
    if (!goalId) return json({ items: [] });
    return json({ items: await listScheduleForGoal(db, goalId) });
  }

  if (path === "/api/schedule/timeline" && method === "GET") {
    const fromDate = asDateOrDefault(url.searchParams.get("from"), todayIso());
    const requestedTo = asDateOrNull(url.searchParams.get("to"));
    const toDate = requestedTo || (await resolveTimelineTo(db, fromDate));
    const safeTo = toDate >= fromDate ? toDate : fromDate;
    const timeline = await listTimeline(db, fromDate, safeTo);
    return json({ from: fromDate, to: safeTo, items: timeline.items, goals: timeline.goals, unscheduled: timeline.unscheduled });
  }

  if (path === "/api/rollover/app-open" && method === "POST") {
    const body = await readBody(request);
    const dateIso = queueDateFrom(body.date);
    return json(await appOpenRollover(db, dateIso));
  }

  if (path === "/api/analytics/day" && method === "GET") {
    const dateIso = queueDateFrom(url.searchParams.get("date"));
    const payload = await analyticsRange(db, dateIso, dateIso);
    return json({
      date: dateIso,
      summary: payload.series[0] || null,
      goals: payload.goals,
    });
  }

  if (path === "/api/analytics/range" && method === "GET") {
    const fromDate = asDateOrDefault(url.searchParams.get("from"), todayIso());
    const toDate = asDateOrDefault(url.searchParams.get("to"), addDays(fromDate, 30));
    return json(await analyticsRange(db, fromDate, toDate));
  }

  if (path.startsWith("/api/queue/")) {
    if (path === "/api/queue/today" && method === "GET") {
      return json(await getQueuePayload(db, queueDateFrom(url.searchParams.get("date"))));
    }

    if (method !== "POST") return json({ error: "not_found" }, 404);

    const body = await readBody(request);
    const dateIso = queueDateFrom(body.date);

    if (path === "/api/queue/start") {
      const entryId = String(body.entry_id || "").trim() || null;
      return startQueue(db, dateIso, entryId);
    }
    if (path === "/api/queue/pause") return pauseQueue(db, dateIso);
    if (path === "/api/queue/skip") return skipQueue(db, dateIso);
    if (path === "/api/queue/reorder") return reorderQueue(db, dateIso, String(body.entry_id || "").trim(), body.direction);
    if (path === "/api/queue/complete") return completeQueue(db, dateIso);
    if (path === "/api/queue/break/ack") return ackBreak(db, dateIso, Boolean(body.skip_break));
  }

  return json({ error: "not_found" }, 404);
}

async function fetchAsset(request, env, overridePath) {
  if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
    return new Response("ASSETS binding is missing.", { status: 500 });
  }
  if (!overridePath) return env.ASSETS.fetch(request);
  const url = new URL(request.url);
  url.pathname = overridePath;
  return env.ASSETS.fetch(new Request(url.toString(), request));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, url, env);
      } catch (error) {
        return json({ error: "request_failed", detail: String(error?.message || error || "unknown_error") }, 500);
      }
    }
    if (url.pathname === "/scheduler" || url.pathname === "/scheduler/") {
      return fetchAsset(request, env, "/scheduler.html");
    }
    return fetchAsset(request, env);
  },
};
