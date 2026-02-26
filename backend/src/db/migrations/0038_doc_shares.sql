-- Share personal hiring interview notes with selected users

CREATE TABLE IF NOT EXISTS doc_shares (
  doc_id UUID NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission VARCHAR(20) NOT NULL DEFAULT 'edit',
  shared_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (doc_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_doc_shares_user ON doc_shares (user_id);
CREATE INDEX IF NOT EXISTS idx_doc_shares_shared_by ON doc_shares (shared_by);
