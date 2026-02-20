ALTER TABLE bots
ADD COLUMN provider VARCHAR(20) NOT NULL DEFAULT 'openai';

UPDATE bots
SET provider = 'openai'
WHERE provider IS NULL;
