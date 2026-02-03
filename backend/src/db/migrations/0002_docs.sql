CREATE TABLE docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES docs(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content_md TEXT DEFAULT '',
  properties JSONB DEFAULT '{}',
  is_database BOOLEAN DEFAULT FALSE,
  schema JSONB,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_docs_project ON docs(project_id);
CREATE INDEX idx_docs_parent ON docs(parent_id);
CREATE INDEX idx_docs_created_by ON docs(created_by);
