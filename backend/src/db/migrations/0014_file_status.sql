-- Add status tracking for file lifecycle management
ALTER TABLE files ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE files ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE;

-- Mark existing attached files
UPDATE files SET status = 'attached' 
WHERE id IN (SELECT DISTINCT file_id FROM message_attachments);

-- Mark existing avatar files (extract UUID from avatar_url like '/api/v1/files/{uuid}')
UPDATE files SET status = 'avatar'
WHERE status = 'pending' 
  AND id IN (
    SELECT CAST(SUBSTRING(avatar_url FROM '/api/v1/files/([^/]+)$') AS UUID)
    FROM users 
    WHERE avatar_url IS NOT NULL 
      AND avatar_url LIKE '/api/v1/files/%'
  );

-- Set expiry for remaining pending files (give them 24h grace period for migration)
UPDATE files SET expires_at = NOW() + INTERVAL '24 hours'
WHERE status = 'pending';

-- Index for efficient cleanup queries
CREATE INDEX idx_files_status_expires ON files(status, expires_at) WHERE status = 'pending';
