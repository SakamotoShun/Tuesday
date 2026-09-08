UPDATE "notifications" SET "read" = false WHERE "read" IS NULL;
--> statement-breakpoint
UPDATE "notifications" SET "created_at" = NOW() WHERE "created_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "read" SET DEFAULT false;
--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "read" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "created_at" SET DEFAULT NOW();
--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "created_at" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "source_event_id" uuid;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "template_version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "template_data" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_created_id_idx"
ON "notifications" ("user_id", "created_at" DESC, "id" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_unread_created_id_idx"
ON "notifications" ("user_id", "created_at" DESC, "id" DESC) WHERE "read" = false;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_source_event_user_unique"
ON "notifications" ("source_event_id", "user_id") WHERE "source_event_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_email_preferences" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" varchar(50) NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "generation" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL,
  CONSTRAINT "notification_email_preferences_pkey" PRIMARY KEY ("user_id", "type"),
  CONSTRAINT "notification_email_preferences_type_check" CHECK ("type" IN ('mention', 'task_assignment', 'notice_assignment', 'meeting_invite', 'project_invite')),
  CONSTRAINT "notification_email_preferences_generation_check" CHECK ("generation" >= 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_email_preferences_user_idx"
ON "notification_email_preferences" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_email_control" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "enabled" boolean DEFAULT false NOT NULL,
  "generation" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL,
  CONSTRAINT "workspace_email_control_singleton" CHECK ("id" = 1),
  CONSTRAINT "workspace_email_control_generation_check" CHECK ("generation" >= 0)
);
--> statement-breakpoint
INSERT INTO "workspace_email_control" ("id", "enabled", "generation")
VALUES (1, false, 0) ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_notification_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "notification_id" uuid NOT NULL REFERENCES "notifications"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" varchar(50) NOT NULL,
  "state" varchar(20) DEFAULT 'queued' NOT NULL,
  "user_generation" integer NOT NULL,
  "workspace_generation" integer NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "retry_cycle" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamptz DEFAULT NOW() NOT NULL,
  "lease_token" uuid,
  "lease_expires_at" timestamptz,
  "authorised_email" varchar(255),
  "message_id" varchar(255) NOT NULL,
  "last_error" varchar(500),
  "sent_at" timestamptz,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL,
  CONSTRAINT "email_notification_deliveries_state_check" CHECK ("state" IN ('queued', 'leased', 'retry_wait', 'sending', 'sent', 'dead', 'cancelled')),
  CONSTRAINT "email_notification_deliveries_attempt_check" CHECK ("attempt_count" BETWEEN 0 AND 40),
  CONSTRAINT "email_notification_deliveries_retry_cycle_check" CHECK ("retry_cycle" BETWEEN 0 AND 3)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_notification_deliveries_notification_unique"
ON "email_notification_deliveries" ("notification_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_notification_deliveries_due_idx"
ON "email_notification_deliveries" ("state", "next_attempt_at", "created_at")
WHERE "state" IN ('queued', 'retry_wait', 'leased');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_notification_deliveries_lease_idx"
ON "email_notification_deliveries" ("lease_expires_at") WHERE "state" IN ('leased', 'sending');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_notification_deliveries_user_idx"
ON "email_notification_deliveries" ("user_id");
