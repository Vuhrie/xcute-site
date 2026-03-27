CREATE TABLE IF NOT EXISTS shared_goals (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'shared',
  title TEXT NOT NULL,
  target_date TEXT,
  daily_hours INTEGER NOT NULL DEFAULT 2,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shared_goals_scope_updated
  ON shared_goals (scope, updated_at DESC);

CREATE TABLE IF NOT EXISTS shared_tasks (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'shared',
  goal_id TEXT NOT NULL,
  title TEXT NOT NULL,
  priority_rank INTEGER NOT NULL,
  estimate_min INTEGER NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (goal_id) REFERENCES shared_goals(id)
);

CREATE INDEX IF NOT EXISTS idx_shared_tasks_scope_goal_priority
  ON shared_tasks (scope, goal_id, priority_rank, created_at);

CREATE TABLE IF NOT EXISTS schedule_entries (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'shared',
  goal_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  date TEXT NOT NULL,
  minutes_allocated INTEGER NOT NULL,
  order_index INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (goal_id) REFERENCES shared_goals(id),
  FOREIGN KEY (task_id) REFERENCES shared_tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_schedule_entries_scope_goal_date_order
  ON schedule_entries (scope, goal_id, date, order_index);
