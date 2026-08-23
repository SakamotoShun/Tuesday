ALTER TABLE "docs" ADD COLUMN "canonical_collab_seq" bigint DEFAULT 0;
--> statement-breakpoint
UPDATE "docs" AS d
SET "canonical_collab_seq" = NULL
WHERE EXISTS (
  SELECT 1 FROM "doc_collab_updates" AS u WHERE u."doc_id" = d."id"
)
OR EXISTS (
  SELECT 1 FROM "doc_collab_snapshots" AS s WHERE s."doc_id" = d."id"
);
--> statement-breakpoint
ALTER TABLE "doc_collab_updates"
ADD CONSTRAINT "doc_collab_updates_update_size_check"
CHECK (octet_length("update") <= 1048576) NOT VALID;
