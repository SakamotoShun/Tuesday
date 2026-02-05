-- Teams and team-based access
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE team_members (
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE team_projects (
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, project_id)
);

ALTER TABLE project_members ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'direct';
ALTER TABLE project_members ADD COLUMN source_team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

UPDATE project_members SET source = 'direct' WHERE source IS NULL;

CREATE INDEX idx_team_members_user ON team_members(user_id);
CREATE INDEX idx_team_projects_project ON team_projects(project_id);
