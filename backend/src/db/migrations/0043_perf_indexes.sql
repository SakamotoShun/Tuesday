-- Add hot-path indexes for session-adjacent and date-range heavy queries

CREATE INDEX IF NOT EXISTS idx_messages_user ON messages (user_id);

CREATE INDEX IF NOT EXISTS idx_messages_deleted_at
  ON messages (deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_user_date
  ON time_entries (user_id, date);

CREATE INDEX IF NOT EXISTS idx_time_entries_project_date
  ON time_entries (project_id, date)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_due_date
  ON tasks (due_date)
  WHERE due_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_created_by
  ON tasks (created_by);

CREATE INDEX IF NOT EXISTS idx_meetings_created_by
  ON meetings (created_by);
