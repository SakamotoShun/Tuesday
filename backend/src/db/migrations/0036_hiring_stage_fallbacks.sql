-- Ensure hiring pipeline always has a usable stage for new and existing applications.

-- If stages exist but none is default, make the first stage the default.
WITH first_stage AS (
  SELECT id
  FROM interview_stages
  ORDER BY sort_order ASC, created_at ASC
  LIMIT 1
)
UPDATE interview_stages
SET is_default = true
WHERE id = (SELECT id FROM first_stage)
  AND EXISTS (SELECT 1 FROM first_stage)
  AND NOT EXISTS (
    SELECT 1
    FROM interview_stages
    WHERE is_default = true
  );

-- Backfill applications that were created without a stage.
WITH default_stage AS (
  SELECT id
  FROM interview_stages
  WHERE is_default = true
  ORDER BY sort_order ASC, created_at ASC
  LIMIT 1
),
first_stage AS (
  SELECT id
  FROM interview_stages
  ORDER BY sort_order ASC, created_at ASC
  LIMIT 1
),
resolved_stage AS (
  SELECT COALESCE(
    (SELECT id FROM default_stage),
    (SELECT id FROM first_stage)
  ) AS id
)
UPDATE job_applications
SET stage_id = (SELECT id FROM resolved_stage)
WHERE stage_id IS NULL
  AND (SELECT id FROM resolved_stage) IS NOT NULL;
