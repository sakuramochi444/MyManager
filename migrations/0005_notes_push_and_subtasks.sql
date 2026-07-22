CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  content TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'sage' CHECK(color IN ('sage', 'blue', 'amber', 'rose')),
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL DEFAULT '',
  auth TEXT NOT NULL DEFAULT '',
  timezone_offset INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE items ADD COLUMN notification_sent_at TEXT;
ALTER TABLE subtasks ADD COLUMN due_date TEXT;

CREATE INDEX IF NOT EXISTS idx_notes_pinned_updated ON notes(pinned, updated_at);
CREATE INDEX IF NOT EXISTS idx_items_pending_notifications ON items(reminder_at, notification_sent_at);
