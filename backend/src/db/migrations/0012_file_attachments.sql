CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE message_attachments (
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (message_id, file_id)
);

CREATE INDEX idx_files_uploaded_by ON files(uploaded_by);
CREATE INDEX idx_message_attachments_message ON message_attachments(message_id);
