CREATE TABLE IF NOT EXISTS schedule_entries_new (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'shared',
  goal_id TEXT NOT NULL,
  task_id TEXT,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  minutes_allocated INTEGER NOT NULL,
  order_index INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (goal_id) REFERENCES shared_goals(id),
  FOREIGN KEY (task_id) REFERENCES shared_tasks(id)
);

INSERT INTO schedule_entries_new (id, scope, goal_id, task_id, title, date, minutes_allocated, order_index, created_at)
SELECT
  e.id,
  e.scope,
  e.goal_id,
  e.task_id,
  COALESCE(t.title, 'Task') AS title,
  e.date,
  e.minutes_allocated,
  e.order_index,
  e.created_at
FROM schedule_entries e
LEFT JOIN shared_tasks t ON t.id = e.task_id;

DROP TABLE schedule_entries;

ALTER TABLE schedule_entries_new RENAME TO schedule_entries;

CREATE INDEX IF NOT EXISTS idx_schedule_entries_scope_goal_date_order
  ON schedule_entries (scope, goal_id, date, order_index);
