ALTER TABLE "time_entries" ALTER COLUMN "project_id" DROP NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "time_entries_project_user_date_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_project_user_date_idx" ON "time_entries" USING btree ("project_id","user_id","date") WHERE "project_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_misc_user_date_idx" ON "time_entries" USING btree ("user_id","date") WHERE "project_id" IS NULL;
