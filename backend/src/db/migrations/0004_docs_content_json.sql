ALTER TABLE docs
  ADD COLUMN content JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE docs
  DROP COLUMN content_md;
