CREATE TABLE task_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL,
  color VARCHAR(20) DEFAULT '#6b7280',
  sort_order INTEGER DEFAULT 0,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description_md TEXT DEFAULT '',
  status_id UUID REFERENCES task_statuses(id),
  start_date DATE,
  due_date DATE,
  sort_order INTEGER DEFAULT 0,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE task_assignees (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_status ON tasks(status_id);
CREATE INDEX idx_task_assignees_user ON task_assignees(user_id);

-- Seed default task statuses
INSERT INTO task_statuses (name, color, sort_order, is_default) VALUES
  ('Backlog', '#6b7280', 0, TRUE),
  ('To Do', '#3b82f6', 1, FALSE),
  ('In Progress', '#f59e0b', 2, FALSE),
  ('Review', '#8b5cf6', 3, FALSE),
  ('Done', '#10b981', 4, FALSE);
