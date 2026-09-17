-- Custom Drizzle migration: the runtime applies numbered SQL files in order.
-- Backfill generation without touching existing Yjs bytes or canonical versions.
ALTER TABLE docs ADD COLUMN collab_generation uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE docs ADD COLUMN collab_projection_pending_at timestamptz;
CREATE INDEX docs_collab_projection_pending_idx ON docs (collab_projection_pending_at)
  WHERE collab_projection_pending_at IS NOT NULL;

CREATE TABLE doc_collab_continuity (
  doc_id uuid PRIMARY KEY REFERENCES docs(id) ON DELETE CASCADE,
  generation uuid NOT NULL,
  through_seq bigint NOT NULL,
  checkpoint bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT doc_collab_continuity_size_check CHECK (octet_length(checkpoint) <= 8388608)
);

-- Discovery repair also covers edits acknowledged before this migration.
UPDATE docs SET collab_projection_pending_at = now()
WHERE canonical_collab_seq IS NULL
   OR EXISTS (SELECT 1 FROM doc_collab_updates u WHERE u.doc_id = docs.id AND u.seq > docs.canonical_collab_seq)
   OR EXISTS (SELECT 1 FROM doc_collab_snapshots s WHERE s.doc_id = docs.id AND s.seq > docs.canonical_collab_seq);
