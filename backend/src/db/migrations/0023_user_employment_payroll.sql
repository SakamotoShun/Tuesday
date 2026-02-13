ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "employment_type" varchar(20) NOT NULL DEFAULT 'full_time';

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "hourly_rate" numeric(10, 2);
