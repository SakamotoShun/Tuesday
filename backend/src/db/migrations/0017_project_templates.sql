-- Add is_template flag to projects table
ALTER TABLE projects ADD COLUMN is_template BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for quick template lookups
CREATE INDEX idx_projects_is_template ON projects (is_template) WHERE is_template = TRUE;
