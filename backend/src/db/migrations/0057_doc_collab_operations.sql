-- Receipts survive checkpoint compaction; reset writers clear the old generation.
CREATE TABLE doc_collab_operations (
  doc_id uuid NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  generation uuid NOT NULL,
  operation_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  request_hash varchar(64) NOT NULL,
  seq bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (doc_id, generation, operation_id)
);
