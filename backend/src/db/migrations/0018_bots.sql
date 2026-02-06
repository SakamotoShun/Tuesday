CREATE TABLE bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  webhook_token VARCHAR(128) NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (webhook_token)
);

CREATE TABLE bot_channel_members (
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  added_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bot_id, channel_id)
);

ALTER TABLE messages ADD COLUMN bot_id UUID REFERENCES bots(id) ON DELETE SET NULL;

CREATE INDEX idx_bot_channel_members_channel ON bot_channel_members(channel_id);
