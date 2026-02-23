-- Add dedicated flag for internal policy databases and rows.
ALTER TABLE docs
ADD COLUMN IF NOT EXISTS is_policy BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_docs_is_policy
ON docs (is_policy)
WHERE is_policy = TRUE;
