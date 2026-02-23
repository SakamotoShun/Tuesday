-- Position docs: link hiring positions to rich collaborative docs

CREATE TABLE IF NOT EXISTS position_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES job_positions(id) ON DELETE CASCADE,
  doc_id UUID NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(position_id, doc_id),
  UNIQUE(doc_id)
);

CREATE INDEX IF NOT EXISTS idx_position_docs_position_sort
  ON position_docs(position_id, sort_order);
