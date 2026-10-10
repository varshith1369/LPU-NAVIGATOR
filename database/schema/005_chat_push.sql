ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS user_id bigint REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS session_hash text;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS support_alerts boolean NOT NULL DEFAULT false;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS campus_alerts boolean NOT NULL DEFAULT false;
