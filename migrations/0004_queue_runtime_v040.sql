CREATE TABLE IF NOT EXISTS queue_item_state (
  scope TEXT NOT NULL DEFAULT 'shared',
  date TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  remaining_sec INTEGER,
  order_override INTEGER,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (scope, date, entry_id),
  FOREIGN KEY (entry_id) REFERENCES schedule_entries(id)
);

CREATE INDEX IF NOT EXISTS idx_queue_item_state_scope_date_order
  ON queue_item_state (scope, date, order_override);

CREATE TABLE IF NOT EXISTS queue_session_state (
  scope TEXT NOT NULL DEFAULT 'shared',
  date TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'task',
  active_entry_id TEXT,
  running INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  remaining_sec INTEGER NOT NULL DEFAULT 0,
  break_sec INTEGER NOT NULL DEFAULT 0,
  state_version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope, date),
  FOREIGN KEY (active_entry_id) REFERENCES schedule_entries(id)
);

CREATE INDEX IF NOT EXISTS idx_queue_session_state_scope_date
  ON queue_session_state (scope, date);
