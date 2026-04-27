CREATE TABLE IF NOT EXISTS rate_limit_entries (
  scope VARCHAR(64) NOT NULL,
  client_key VARCHAR(255) NOT NULL,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scope, client_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_entries_expires_at
  ON rate_limit_entries (expires_at);
