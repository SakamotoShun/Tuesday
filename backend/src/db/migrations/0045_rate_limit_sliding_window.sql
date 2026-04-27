WITH ranked_entries AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY scope, client_key
      ORDER BY expires_at DESC, updated_at DESC, ctid DESC
    ) AS row_number
  FROM rate_limit_entries
)
DELETE FROM rate_limit_entries
WHERE ctid IN (
  SELECT ctid
  FROM ranked_entries
  WHERE row_number > 1
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rate_limit_entries'
      AND column_name = 'window_start'
  ) THEN
    ALTER TABLE rate_limit_entries RENAME COLUMN window_start TO first_request_at;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'rate_limit_entries'::regclass
      AND conname = 'rate_limit_entries_pkey'
  ) THEN
    ALTER TABLE rate_limit_entries DROP CONSTRAINT rate_limit_entries_pkey;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'rate_limit_entries'::regclass
      AND conname = 'rate_limit_entries_scope_client_key_pkey'
  ) THEN
    ALTER TABLE rate_limit_entries
      ADD CONSTRAINT rate_limit_entries_scope_client_key_pkey PRIMARY KEY (scope, client_key);
  END IF;
END $$;
