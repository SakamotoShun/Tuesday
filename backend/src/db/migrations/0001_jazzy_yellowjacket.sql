CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(30) NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_name" varchar(255) NOT NULL,
	"project_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"email" varchar(255),
	"phone" varchar(50),
	"resume_url" text,
	"source" varchar(100),
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_shares" (
	"doc_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"permission" varchar(20) DEFAULT 'edit' NOT NULL,
	"shared_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doc_shares_doc_id_user_id_pk" PRIMARY KEY("doc_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entity_type" varchar(30) NOT NULL,
	"entity_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid,
	"interview_id" uuid,
	"doc_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(50) NOT NULL,
	"color" varchar(20) DEFAULT '#6b7280' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"interviewer_id" uuid,
	"scheduled_at" timestamp with time zone,
	"duration_minutes" integer,
	"type" varchar(50),
	"location" varchar(255),
	"link" text,
	"rating" integer,
	"feedback" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"stage_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(200) NOT NULL,
	"department" varchar(100),
	"description_md" text DEFAULT '',
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"hiring_manager_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" uuid NOT NULL,
	"key" varchar(200) NOT NULL,
	"tool_name" varchar(100) NOT NULL,
	"result_entity_type" varchar(50),
	"result_entity_id" uuid,
	"response_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notice_board_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(20) NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"created_by" uuid NOT NULL,
	"assignee_id" uuid,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_by" uuid,
	"completed_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "position_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position_id" uuid NOT NULL,
	"doc_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" varchar(64) NOT NULL,
	"doc_id" uuid NOT NULL,
	"permission" varchar(20) DEFAULT 'view' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"type" varchar(30) NOT NULL,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "time_entries_user_date_idx";--> statement-breakpoint
ALTER TABLE "meetings" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "time_entries" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bots" ADD COLUMN "provider" varchar(20) DEFAULT 'openai' NOT NULL;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN "search_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN "is_policy" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "link" varchar(2048);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "budget_hours" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "employment_type" varchar(20) DEFAULT 'full_time' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "hourly_rate" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_shares" ADD CONSTRAINT "doc_shares_doc_id_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_shares" ADD CONSTRAINT "doc_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_shares" ADD CONSTRAINT "doc_shares_shared_by_users_id_fk" FOREIGN KEY ("shared_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_notes" ADD CONSTRAINT "interview_notes_application_id_job_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."job_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_notes" ADD CONSTRAINT "interview_notes_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_notes" ADD CONSTRAINT "interview_notes_doc_id_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_notes" ADD CONSTRAINT "interview_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_job_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."job_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_interviewer_id_users_id_fk" FOREIGN KEY ("interviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_position_id_job_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."job_positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_stage_id_interview_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."interview_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_positions" ADD CONSTRAINT "job_positions_hiring_manager_id_users_id_fk" FOREIGN KEY ("hiring_manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_positions" ADD CONSTRAINT "job_positions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_idempotency_keys" ADD CONSTRAINT "mcp_idempotency_keys_token_id_mcp_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."mcp_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_board_items" ADD CONSTRAINT "notice_board_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_board_items" ADD CONSTRAINT "notice_board_items_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_board_items" ADD CONSTRAINT "notice_board_items_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_docs" ADD CONSTRAINT "position_docs_position_id_job_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."job_positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_docs" ADD CONSTRAINT "position_docs_doc_id_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_docs" ADD CONSTRAINT "position_docs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_links" ADD CONSTRAINT "shared_links_doc_id_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_links" ADD CONSTRAINT "shared_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_logs_actor_id_idx" ON "activity_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "activity_logs_project_id_idx" ON "activity_logs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_candidates_created_by" ON "candidates" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_doc_shares_user" ON "doc_shares" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_doc_shares_shared_by" ON "doc_shares" USING btree ("shared_by");--> statement-breakpoint
CREATE INDEX "favorites_user_sort_order_idx" ON "favorites" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_user_entity_unique" ON "favorites" USING btree ("user_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_interview_notes_application" ON "interview_notes" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "idx_interview_notes_interview" ON "interview_notes" USING btree ("interview_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_interview_notes_doc_id_unique" ON "interview_notes" USING btree ("doc_id");--> statement-breakpoint
CREATE INDEX "idx_interviews_application" ON "interviews" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "idx_interviews_interviewer" ON "interviews" USING btree ("interviewer_id");--> statement-breakpoint
CREATE INDEX "idx_job_applications_position" ON "job_applications" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "idx_job_applications_candidate" ON "job_applications" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "idx_job_applications_stage" ON "job_applications" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "idx_hiring_positions_status" ON "job_positions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_hiring_positions_created_by" ON "job_positions" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_idempotency_token_key_unique" ON "mcp_idempotency_keys" USING btree ("token_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_tokens_token_hash_unique" ON "mcp_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "mcp_tokens_user_id_idx" ON "mcp_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notice_board_items_sort_created_idx" ON "notice_board_items" USING btree ("sort_order","created_at");--> statement-breakpoint
CREATE INDEX "notice_board_items_type_idx" ON "notice_board_items" USING btree ("type");--> statement-breakpoint
CREATE INDEX "notice_board_items_assignee_id_idx" ON "notice_board_items" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "idx_position_docs_position_sort" ON "position_docs" USING btree ("position_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "position_docs_position_doc_unique" ON "position_docs" USING btree ("position_id","doc_id");--> statement-breakpoint
CREATE UNIQUE INDEX "position_docs_doc_id_unique" ON "position_docs" USING btree ("doc_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_shared_links_token" ON "shared_links" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_shared_links_doc_unique" ON "shared_links" USING btree ("doc_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tokens_token_hash_unique" ON "tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "tokens_user_type_idx" ON "tokens" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "tokens_expires_at_idx" ON "tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "doc_collab_snapshots_doc_seq_idx" ON "doc_collab_snapshots" USING btree ("doc_id","seq");--> statement-breakpoint
CREATE INDEX "doc_collab_updates_doc_seq_idx" ON "doc_collab_updates" USING btree ("doc_id","seq");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "whiteboard_collab_snapshots_board_seq_idx" ON "whiteboard_collab_snapshots" USING btree ("whiteboard_id","seq");--> statement-breakpoint
CREATE INDEX "whiteboard_collab_updates_board_seq_idx" ON "whiteboard_collab_updates" USING btree ("whiteboard_id","seq");