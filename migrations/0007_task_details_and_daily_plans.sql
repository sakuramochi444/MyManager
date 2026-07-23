ALTER TABLE items ADD COLUMN progress TEXT NOT NULL DEFAULT 'not_started' CHECK(progress IN ('not_started', 'in_progress', 'done'));
ALTER TABLE items ADD COLUMN all_day INTEGER NOT NULL DEFAULT 1;
ALTER TABLE items ADD COLUMN start_time TEXT;
ALTER TABLE items ADD COLUMN end_time TEXT;

UPDATE items SET progress = CASE WHEN status = 'done' THEN 'done' ELSE 'not_started' END WHERE progress IS NULL OR progress = 'not_started';

CREATE TABLE IF NOT EXISTS daily_plans (
  date TEXT PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
