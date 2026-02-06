-- Add AI bot support columns to bots table
ALTER TABLE bots ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'webhook';
ALTER TABLE bots ADD COLUMN system_prompt TEXT;
ALTER TABLE bots ADD COLUMN model VARCHAR(100);
