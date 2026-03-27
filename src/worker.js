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

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
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

  const rows = [db.prepare("DELETE FROM schedule_entries WHERE scope = ? AND goal_id = ?").bind(SHARED_SCOPE, goalId)];
  const overflow = [];
  const entries = [];

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
    entries.push(entry);
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

      entries.push(entry);
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
    if (url.pathname.startsWith("/api/")) return handleApi(request, url, env);
    if (url.pathname === "/scheduler" || url.pathname === "/scheduler/") {
      return fetchAsset(request, env, "/scheduler.html");
    }
    return fetchAsset(request, env);
  },
};
