const SHARED_SCOPE = "shared";
const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
      `SELECT id, title, target_date, daily_hours, created_at, updated_at
       FROM shared_goals
       WHERE scope = ?
       ORDER BY updated_at DESC, created_at DESC`
    )
    .bind(SHARED_SCOPE)
    .all();
  return results || [];
}

async function findGoal(db, id) {
  const { results } = await db
    .prepare(
      `SELECT id, title, target_date, daily_hours, created_at, updated_at
       FROM shared_goals
       WHERE id = ? AND scope = ?
       LIMIT 1`
    )
    .bind(id, SHARED_SCOPE)
    .all();
  return (results || [])[0] || null;
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

async function listTimeline(db, fromDate, toDate) {
  const { results } = await db
    .prepare(
      `SELECT e.id AS entry_id,
              e.goal_id,
              g.title AS goal_title,
              g.target_date AS goal_target_date,
              g.daily_hours AS goal_daily_hours,
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
    task_id: row.task_id,
    title: row.title,
    date: row.date,
    minutes_allocated: asInt(row.minutes_allocated, 0),
    order_index: asInt(row.order_index, 0),
    queue_status: row.queue_status,
    entry_done: row.queue_status === "done",
  }));

  const stats = new Map();
  for (const item of items) {
    if (!stats.has(item.goal_id)) {
      stats.set(item.goal_id, {
        id: item.goal_id,
        title: item.goal_title,
        target_date: item.goal_target_date,
        daily_hours: item.goal_daily_hours,
        total_min: 0,
        completed_min: 0,
      });
    }
    const stat = stats.get(item.goal_id);
    stat.total_min += item.minutes_allocated;
    if (item.entry_done) stat.completed_min += item.minutes_allocated;
  }

  const goals = [...stats.values()].sort((a, b) => String(a.title).localeCompare(String(b.title)));
  return { items, goals };
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
  return rows.find((row) => row.runtime_status !== "done" && row.entry_id !== excludeEntryId) || null;
}

async function maybeMarkTaskComplete(db, taskId) {
  if (!taskId) return;

  const { results } = await db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM schedule_entries e
       LEFT JOIN queue_item_state q ON q.scope = e.scope AND q.date = e.date AND q.entry_id = e.id
       WHERE e.scope = ? AND e.task_id = ? AND COALESCE(q.status, 'pending') != 'done'`
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
      ? rows.some((row) => row.entry_id === session.active_entry_id && row.runtime_status !== "done")
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

    if (session.mode === "task" && session.active_entry_id === row.entry_id && row.runtime_status !== "done") {
      status = session.running === 1 ? "running" : "paused";
      remaining = effectiveSessionRemaining;
    }

    return {
      entry_id: row.entry_id,
      goal_id: row.goal_id,
      goal_title: row.goal_title,
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

  const pendingRows = rows.filter((row) => row.runtime_status !== "done");
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

  return json(await getQueuePayload(db, dateIso));
}

async function skipQueue(db, dateIso) {
  const { rows, session } = await normalizeQueueState(db, dateIso);
  if (session.mode === "break") return json({ error: "cannot_skip_during_break" }, 409);

  const active = session.active_entry_id
    ? rows.find((row) => row.entry_id === session.active_entry_id && row.runtime_status !== "done")
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

  return json(await getQueuePayload(db, dateIso));
}

async function completeQueue(db, dateIso) {
  const { rows, session } = await normalizeQueueState(db, dateIso);
  if (session.mode === "break") return json({ error: "cannot_complete_during_break" }, 409);

  const active = session.active_entry_id
    ? rows.find((row) => row.entry_id === session.active_entry_id && row.runtime_status !== "done")
    : firstPendingEntry(rows);

  if (!active) return json({ error: "no_pending_items" }, 400);

  await completeEntryAndStartBreak(db, dateIso, active.entry_id);
  return json(await getQueuePayload(db, dateIso));
}

async function ackBreak(db, dateIso, skipBreak) {
  const { rows, session } = await normalizeQueueState(db, dateIso);
  if (session.mode !== "break") return json(buildQueuePayload(rows, session, dateIso));

  const remaining = effectiveRemainingSec(session);
  if (remaining > 0 && !skipBreak) {
    return json({ error: "break_not_finished", remaining_sec: remaining }, 409);
  }

  const pendingRows = rows.filter((row) => row.runtime_status !== "done");
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
        overflow.push({
          task_id: task.id,
          title: task.title,
          remaining_min: remaining,
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
        created_at: nowIso(),
        updated_at: nowIso(),
      };

      await db
        .prepare(
          `INSERT INTO shared_goals (id, scope, title, target_date, daily_hours, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(row.id, SHARED_SCOPE, row.title, row.target_date, row.daily_hours, row.created_at, row.updated_at)
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
        updated_at: nowIso(),
      };

      await db
        .prepare(
          `UPDATE shared_goals
           SET title = ?, target_date = ?, daily_hours = ?, updated_at = ?
           WHERE id = ? AND scope = ?`
        )
        .bind(next.title, next.target_date, next.daily_hours, next.updated_at, id, SHARED_SCOPE)
        .run();

      return json({ item: next });
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
    return json({ from: fromDate, to: safeTo, items: timeline.items, goals: timeline.goals });
  }

  if (path === "/api/queue/today" && method === "GET") {
    const dateIso = asDateOrDefault(url.searchParams.get("date"), todayIso());
    return json(await getQueuePayload(db, dateIso));
  }

  if (path === "/api/queue/start" && method === "POST") {
    const body = await readBody(request);
    const dateIso = asDateOrDefault(body.date, todayIso());
    const entryId = String(body.entry_id || "").trim() || null;
    return startQueue(db, dateIso, entryId);
  }

  if (path === "/api/queue/pause" && method === "POST") {
    const body = await readBody(request);
    const dateIso = asDateOrDefault(body.date, todayIso());
    return pauseQueue(db, dateIso);
  }

  if (path === "/api/queue/skip" && method === "POST") {
    const body = await readBody(request);
    const dateIso = asDateOrDefault(body.date, todayIso());
    return skipQueue(db, dateIso);
  }

  if (path === "/api/queue/complete" && method === "POST") {
    const body = await readBody(request);
    const dateIso = asDateOrDefault(body.date, todayIso());
    return completeQueue(db, dateIso);
  }

  if (path === "/api/queue/break/ack" && method === "POST") {
    const body = await readBody(request);
    const dateIso = asDateOrDefault(body.date, todayIso());
    return ackBreak(db, dateIso, Boolean(body.skip_break));
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
