-- Add access controls for chat channels
ALTER TABLE channels
  ADD COLUMN access VARCHAR(20) NOT NULL DEFAULT 'public';

-- Add member roles for channel membership
ALTER TABLE channel_members
  ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'member';
