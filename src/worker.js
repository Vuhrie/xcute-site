import { buildSchedule, todayIso } from "./planner.js";

const OTP_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const mem = {
  usersByEmail: new Map(),
  users: new Map(),
  otp: new Map(),
  sessions: new Map(),
  goals: new Map(),
  milestones: new Map(),
  tasks: new Map(),
  blocks: new Map(),
  prefs: new Map(),
};

function nowIso() {
  return new Date().toISOString();
}

function id() {
  return crypto.randomUUID();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function emailOk(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function bearer(request) {
  const raw = request.headers.get("authorization") || "";
  const [scheme, token] = raw.split(" ");
  return scheme?.toLowerCase() === "bearer" ? token : "";
}

async function readBody(request) {
  if (!request.body) return {};
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function forUser(store, userId) {
  return [...store.values()].filter((x) => x.user_id === userId);
}

function sortByCreatedDesc(items) {
  return items.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

function userData(userId) {
  return {
    goals: sortByCreatedDesc(forUser(mem.goals, userId)),
    milestones: sortByCreatedDesc(forUser(mem.milestones, userId)),
    tasks: sortByCreatedDesc(forUser(mem.tasks, userId)),
  };
}

function sessionUser(request) {
  const token = bearer(request);
  if (!token) return null;
  const session = mem.sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    mem.sessions.delete(token);
    return null;
  }
  return session.user;
}

function getPrefs(userId) {
  return (
    mem.prefs.get(userId) || {
      user_id: userId,
      timezone: "UTC",
      work_start: "09:00",
      work_end: "18:00",
      break_min: 10,
      buffer_min: 5,
      updated_at: nowIso(),
    }
  );
}

function listBlocksByDate(userId, date) {
  return [...mem.blocks.values()]
    .filter((b) => b.user_id === userId && b.date === date)
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
}

function replaceAutoBlocks(userId, date, blocks) {
  for (const [key, row] of mem.blocks.entries()) {
    if (row.user_id === userId && row.date === date && !row.locked && !row.completed) mem.blocks.delete(key);
  }
  const createdAt = nowIso();
  for (const block of blocks) {
    const row = { id: id(), user_id: userId, ...block, created_at: createdAt, updated_at: createdAt };
    mem.blocks.set(row.id, row);
  }
  return listBlocksByDate(userId, date);
}

function generateSchedule(userId, date, keepFixed) {
  const targetDate = date || todayIso();
  const tasks = userData(userId).tasks.filter((t) => !t.completed && (!t.deferred_until || t.deferred_until <= targetDate));
  const prefs = getPrefs(userId);
  const blocks = listBlocksByDate(userId, targetDate);
  const fixed = keepFixed ? blocks.filter((b) => b.locked || b.completed) : [];
  const planned = buildSchedule({
    dateIso: targetDate,
    tasks,
    fixedBlocks: fixed,
    preferences: prefs,
    source: keepFixed ? "reflow" : "generate",
  });
  const merged = keepFixed
    ? [
        ...fixed.map((b) => ({
          task_id: b.task_id || null,
          title: b.title,
          date: b.date,
          start_at: b.start_at,
          end_at: b.end_at,
          locked: b.locked ? 1 : 0,
          completed: b.completed ? 1 : 0,
          source: b.source || "fixed",
          score: Number(b.score || 0),
        })),
        ...planned.blocks,
      ]
    : planned.blocks;
  return { date: targetDate, blocks: replaceAutoBlocks(userId, targetDate, merged), deferred: planned.deferred || [] };
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

async function handleApi(request, url) {
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (path === "/api/health" && method === "GET") return json({ ok: true, mode: "memory" });

  if (path === "/api/auth/request-otp" && method === "POST") {
    const body = await readBody(request);
    const email = String(body.email || "").trim().toLowerCase();
    if (!emailOk(email)) return json({ error: "invalid_email" }, 400);
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    mem.otp.set(email, { otp, expiresAt: Date.now() + OTP_TTL_MS });
    return json({ ok: true, expires_in_sec: 600, dev_otp: otp });
  }

  if (path === "/api/auth/verify-otp" && method === "POST") {
    const body = await readBody(request);
    const email = String(body.email || "").trim().toLowerCase();
    const otp = String(body.otp || "").trim();
    const entry = mem.otp.get(email);
    if (!entry || Date.now() > entry.expiresAt || entry.otp !== otp) return json({ error: "invalid_otp" }, 401);
    mem.otp.delete(email);

    let user = mem.usersByEmail.get(email);
    if (!user) {
      user = { id: id(), email, created_at: nowIso() };
      mem.usersByEmail.set(email, user);
      mem.users.set(user.id, user);
    }

    const token = crypto.randomUUID().replace(/-/g, "");
    mem.sessions.set(token, { user: { user_id: user.id, email: user.email }, expiresAt: Date.now() + SESSION_TTL_MS });
    return json({ token, user });
  }

  if (path === "/api/auth/logout" && method === "POST") {
    const token = bearer(request);
    if (token) mem.sessions.delete(token);
    return json({ ok: true });
  }

  const user = sessionUser(request);
  if (!user) return json({ error: "unauthorized" }, 401);
  const userId = user.user_id;

  if (path === "/api/goals") {
    if (method === "GET") return json({ items: userData(userId).goals });
    if (method === "POST") {
      const body = await readBody(request);
      const row = {
        id: id(),
        user_id: userId,
        title: String(body.title || "").trim() || "Untitled Goal",
        description: body.description || null,
        target_date: body.target_date || null,
        status: body.status || "active",
        priority: Number(body.priority || 3),
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      mem.goals.set(row.id, row);
      return json({ item: row });
    }
    if (method === "PATCH") {
      const body = await readBody(request);
      const row = mem.goals.get(String(body.id || ""));
      if (!row || row.user_id !== userId) return json({ item: null });
      Object.assign(row, {
        title: body.title ?? row.title,
        description: body.description ?? row.description,
        target_date: body.target_date ?? row.target_date,
        status: body.status ?? row.status,
        priority: body.priority ?? row.priority,
        updated_at: nowIso(),
      });
      return json({ item: row });
    }
  }

  if (path === "/api/milestones") {
    if (method === "GET") return json({ items: userData(userId).milestones });
    if (method === "POST") {
      const body = await readBody(request);
      const row = {
        id: id(),
        user_id: userId,
        goal_id: body.goal_id || null,
        title: String(body.title || "").trim() || "Untitled Milestone",
        due_date: body.due_date || null,
        status: body.status || "active",
        weight: Number(body.weight || 1),
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      mem.milestones.set(row.id, row);
      return json({ item: row });
    }
    if (method === "PATCH") {
      const body = await readBody(request);
      const row = mem.milestones.get(String(body.id || ""));
      if (!row || row.user_id !== userId) return json({ item: null });
      Object.assign(row, {
        goal_id: body.goal_id ?? row.goal_id,
        title: body.title ?? row.title,
        due_date: body.due_date ?? row.due_date,
        status: body.status ?? row.status,
        weight: body.weight ?? row.weight,
        updated_at: nowIso(),
      });
      return json({ item: row });
    }
  }

  if (path === "/api/tasks") {
    if (method === "GET") return json({ items: userData(userId).tasks });
    if (method === "POST") {
      const body = await readBody(request);
      const row = {
        id: id(),
        user_id: userId,
        goal_id: body.goal_id || null,
        milestone_id: body.milestone_id || null,
        title: String(body.title || "").trim() || "Untitled Task",
        description: body.description || null,
        duration_min: Number(body.duration_min || 30),
        priority: Number(body.priority || 3),
        deadline: body.deadline || null,
        category: body.category || null,
        energy: body.energy || "medium",
        depends_on: body.depends_on || null,
        locked: body.locked ? 1 : 0,
        completed: body.completed ? 1 : 0,
        deferred_until: body.deferred_until || null,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      mem.tasks.set(row.id, row);
      return json({ item: row });
    }
    if (method === "PATCH") {
      const body = await readBody(request);
      const row = mem.tasks.get(String(body.id || ""));
      if (!row || row.user_id !== userId) return json({ item: null });
      Object.assign(row, { ...body, updated_at: nowIso() });
      return json({ item: row });
    }
  }

  if (path === "/api/preferences") {
    if (method === "GET") return json({ item: getPrefs(userId) });
    if (method === "PATCH") {
      const body = await readBody(request);
      const current = getPrefs(userId);
      const next = {
        ...current,
        timezone: body.timezone ?? current.timezone,
        work_start: body.work_start ?? current.work_start,
        work_end: body.work_end ?? current.work_end,
        break_min: Number.isFinite(body.break_min) ? body.break_min : current.break_min,
        buffer_min: Number.isFinite(body.buffer_min) ? body.buffer_min : current.buffer_min,
        updated_at: nowIso(),
      };
      mem.prefs.set(userId, next);
      return json({ item: next });
    }
  }

  if (path === "/api/schedule/generate" && method === "POST") {
    const body = await readBody(request);
    return json(generateSchedule(userId, body.date, false));
  }

  if (path === "/api/schedule/reflow" && method === "POST") {
    const body = await readBody(request);
    return json(generateSchedule(userId, body.date, true));
  }

  if (path === "/api/schedule/day" && method === "GET") {
    const date = url.searchParams.get("date") || todayIso();
    return json({ date, blocks: listBlocksByDate(userId, date) });
  }

  const lockMatch = path.match(/^\/api\/blocks\/([^/]+)\/lock$/);
  if (lockMatch && method === "PATCH") {
    const body = await readBody(request);
    const row = mem.blocks.get(lockMatch[1]);
    if (!row || row.user_id !== userId) return json({ item: null });
    row.locked = body.locked ? 1 : 0;
    row.updated_at = nowIso();
    return json({ item: row });
  }

  const completeMatch = path.match(/^\/api\/blocks\/([^/]+)\/complete$/);
  if (completeMatch && method === "PATCH") {
    const body = await readBody(request);
    const row = mem.blocks.get(completeMatch[1]);
    if (!row || row.user_id !== userId) return json({ item: null });
    row.completed = body.completed ? 1 : 0;
    row.updated_at = nowIso();
    if (row.completed && row.task_id && mem.tasks.has(row.task_id)) {
      const task = mem.tasks.get(row.task_id);
      task.completed = 1;
      task.updated_at = nowIso();
    }
    return json({ item: row });
  }

  return json({ error: "not_found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, url);
    if (url.pathname === "/scheduler" || url.pathname === "/scheduler/") {
      return fetchAsset(request, env, "/scheduler.html");
    }
    return fetchAsset(request, env);
  },
};