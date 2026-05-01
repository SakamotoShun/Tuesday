CREATE INDEX IF NOT EXISTS doc_collab_snapshots_doc_seq_idx
  ON doc_collab_snapshots (doc_id, seq);

CREATE INDEX IF NOT EXISTS doc_collab_updates_doc_seq_idx
  ON doc_collab_updates (doc_id, seq);

CREATE INDEX IF NOT EXISTS whiteboard_collab_snapshots_board_seq_idx
  ON whiteboard_collab_snapshots (whiteboard_id, seq);

CREATE INDEX IF NOT EXISTS whiteboard_collab_updates_board_seq_idx
  ON whiteboard_collab_updates (whiteboard_id, seq);
