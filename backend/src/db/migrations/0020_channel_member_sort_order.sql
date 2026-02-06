-- Add per-user channel ordering for chat sidebar sorting
ALTER TABLE channel_members
  ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
