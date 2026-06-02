DROP INDEX IF EXISTS "mcp_idempotency_token_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_idempotency_token_key_tool_unique" ON "mcp_idempotency_keys" USING btree ("token_id","key","tool_name");
