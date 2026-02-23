-- Track whether a user has completed onboarding tour

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
