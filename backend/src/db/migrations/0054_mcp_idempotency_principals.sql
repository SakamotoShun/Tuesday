ALTER TABLE "mcp_idempotency_keys" ALTER COLUMN "token_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "mcp_idempotency_keys" ADD COLUMN IF NOT EXISTS "principal_type" varchar(20);
--> statement-breakpoint
ALTER TABLE "mcp_idempotency_keys" ADD COLUMN IF NOT EXISTS "user_id" uuid;
--> statement-breakpoint
ALTER TABLE "mcp_idempotency_keys" ADD COLUMN IF NOT EXISTS "principal_id" varchar(200);
--> statement-breakpoint
ALTER TABLE "mcp_idempotency_keys" ADD COLUMN IF NOT EXISTS "request_hash" varchar(64);
--> statement-breakpoint
ALTER TABLE "mcp_idempotency_keys" ADD COLUMN IF NOT EXISTS "tool_version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
UPDATE "mcp_idempotency_keys"
SET "principal_type" = 'pat',
    "principal_id" = "token_id"::text,
    "request_hash" = 'legacy'
WHERE "principal_type" IS NULL OR "principal_id" IS NULL OR "request_hash" IS NULL;
--> statement-breakpoint
ALTER TABLE "mcp_idempotency_keys" ALTER COLUMN "principal_type" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "mcp_idempotency_keys" ALTER COLUMN "principal_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "mcp_idempotency_keys" ALTER COLUMN "request_hash" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mcp_idempotency_keys" ADD CONSTRAINT "mcp_idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "mcp_idempotency_token_key_tool_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_idempotency_principal_key_tool_unique"
ON "mcp_idempotency_keys" USING btree ("principal_type", "principal_id", "key", "tool_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_idempotency_token_id_idx"
ON "mcp_idempotency_keys" USING btree ("token_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_idempotency_user_id_idx"
ON "mcp_idempotency_keys" USING btree ("user_id");
