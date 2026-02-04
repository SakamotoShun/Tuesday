CREATE TABLE doc_collab_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  seq bigint NOT NULL,
  snapshot bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX doc_collab_snapshots_doc_id_seq_idx
  ON doc_collab_snapshots(doc_id, seq DESC);

CREATE TABLE doc_collab_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  seq bigserial NOT NULL,
  update bytea NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX doc_collab_updates_doc_id_seq_idx
  ON doc_collab_updates(doc_id, seq);
