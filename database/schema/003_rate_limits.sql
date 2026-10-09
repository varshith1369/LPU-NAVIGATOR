CREATE TABLE IF NOT EXISTS request_rate_limits (
 bucket text NOT NULL,
 client_key text NOT NULL,
 hits integer NOT NULL,
 reset_at timestamptz NOT NULL,
 PRIMARY KEY(bucket,client_key)
);
CREATE INDEX IF NOT EXISTS rate_limit_expiry ON request_rate_limits(reset_at);
