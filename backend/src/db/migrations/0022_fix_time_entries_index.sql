DROP INDEX IF EXISTS "time_entries_user_date_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "time_entries_project_user_date_idx" ON "time_entries" USING btree ("project_id","user_id","date");
