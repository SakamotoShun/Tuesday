-- Backfill and normalize shared_links schema to use doc_id

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shared_links'
      AND column_name = 'resource_id'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shared_links'
      AND column_name = 'doc_id'
  ) THEN
    ALTER TABLE shared_links ADD COLUMN doc_id UUID;
    UPDATE shared_links
    SET doc_id = resource_id
    WHERE doc_id IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shared_links'
      AND column_name = 'resource_type'
  ) THEN
    DELETE FROM shared_links WHERE resource_type <> 'doc';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shared_links'
      AND column_name = 'doc_id'
  ) THEN
    DELETE FROM shared_links WHERE doc_id IS NULL;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'shared_links_doc_id_fkey'
    ) THEN
      ALTER TABLE shared_links
      ADD CONSTRAINT shared_links_doc_id_fkey
      FOREIGN KEY (doc_id)
      REFERENCES docs(id)
      ON DELETE CASCADE;
    END IF;

    ALTER TABLE shared_links ALTER COLUMN doc_id SET NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_links_token ON shared_links (token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_links_doc_unique ON shared_links (doc_id);

DROP INDEX IF EXISTS idx_shared_links_resource;
DROP INDEX IF EXISTS idx_shared_links_resource_unique;

ALTER TABLE shared_links DROP COLUMN IF EXISTS resource_type;
ALTER TABLE shared_links DROP COLUMN IF EXISTS resource_id;
