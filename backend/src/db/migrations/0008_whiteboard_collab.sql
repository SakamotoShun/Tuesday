CREATE TABLE whiteboard_collab_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whiteboard_id uuid NOT NULL REFERENCES whiteboards(id) ON DELETE CASCADE,
  seq bigint NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX whiteboard_collab_snapshots_whiteboard_id_seq_idx
  ON whiteboard_collab_snapshots(whiteboard_id, seq DESC);

CREATE TABLE whiteboard_collab_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whiteboard_id uuid NOT NULL REFERENCES whiteboards(id) ON DELETE CASCADE,
  seq bigserial NOT NULL,
  update jsonb NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX whiteboard_collab_updates_whiteboard_id_seq_idx
  ON whiteboard_collab_updates(whiteboard_id, seq);
