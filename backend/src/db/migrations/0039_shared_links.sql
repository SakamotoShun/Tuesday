-- Public share links for docs
CREATE TABLE IF NOT EXISTS shared_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(64) NOT NULL,
  doc_id UUID NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  permission VARCHAR(20) NOT NULL DEFAULT 'view',
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_links_token ON shared_links (token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_links_doc_unique ON shared_links (doc_id);
