ALTER TABLE shared_goals
ADD COLUMN weight_level TEXT NOT NULL DEFAULT 'medium';

CREATE TABLE IF NOT EXISTS unscheduled_entries (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'shared',
  goal_id TEXT NOT NULL,
  task_id TEXT,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  remaining_min INTEGER NOT NULL,
  reason TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (goal_id) REFERENCES shared_goals(id),
  FOREIGN KEY (task_id) REFERENCES shared_tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_unscheduled_scope_date
  ON unscheduled_entries (scope, date, source);

CREATE TABLE IF NOT EXISTS rollover_runs (
  scope TEXT NOT NULL DEFAULT 'shared',
  date TEXT NOT NULL,
  carried_count INTEGER NOT NULL DEFAULT 0,
  unscheduled_count INTEGER NOT NULL DEFAULT 0,
  banner_message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (scope, date)
);

CREATE TABLE IF NOT EXISTS queue_events (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'shared',
  date TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entry_id TEXT,
  meta_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (entry_id) REFERENCES schedule_entries(id)
);

CREATE INDEX IF NOT EXISTS idx_queue_events_scope_date_type
  ON queue_events (scope, date, event_type);
