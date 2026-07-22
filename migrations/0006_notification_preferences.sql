ALTER TABLE push_subscriptions ADD COLUMN due_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE push_subscriptions ADD COLUMN daily_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE push_subscriptions ADD COLUMN daily_time TEXT NOT NULL DEFAULT '09:00';
ALTER TABLE push_subscriptions ADD COLUMN quiet_start TEXT NOT NULL DEFAULT '22:00';
ALTER TABLE push_subscriptions ADD COLUMN quiet_end TEXT NOT NULL DEFAULT '07:00';
ALTER TABLE push_subscriptions ADD COLUMN quiet_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE push_subscriptions ADD COLUMN last_daily_date TEXT;
