CREATE TABLE IF NOT EXISTS tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL,
  type VARCHAR(30) NOT NULL,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS tokens_token_hash_unique ON tokens (token_hash);
CREATE INDEX IF NOT EXISTS tokens_user_type_idx ON tokens (user_id, type);
CREATE INDEX IF NOT EXISTS tokens_expires_at_idx ON tokens (expires_at);
