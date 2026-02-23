-- Link interview notes to real docs so notes open in full doc editor

ALTER TABLE interview_notes
  ADD COLUMN IF NOT EXISTS doc_id UUID;

INSERT INTO docs (
  project_id,
  parent_id,
  title,
  content,
  search_text,
  properties,
  is_database,
  schema,
  created_by,
  created_at,
  updated_at
)
SELECT
  NULL,
  NULL,
  n.title,
  COALESCE(n.content, '[]'::jsonb),
  '',
  jsonb_strip_nulls(
    jsonb_build_object(
      'source', 'hiring',
      'hiringType', 'interview_note',
      'hiringNoteId', n.id,
      'hiringApplicationId', n.application_id,
      'hiringInterviewId', n.interview_id
    )
  ),
  false,
  NULL,
  n.created_by,
  n.created_at,
  n.updated_at
FROM interview_notes n
WHERE n.doc_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM docs d
    WHERE d.properties ->> 'hiringType' = 'interview_note'
      AND d.properties ->> 'hiringNoteId' = n.id::text
  );

UPDATE interview_notes n
SET doc_id = d.id
FROM docs d
WHERE n.doc_id IS NULL
  AND d.properties ->> 'hiringType' = 'interview_note'
  AND d.properties ->> 'hiringNoteId' = n.id::text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'interview_notes_doc_id_fkey'
  ) THEN
    ALTER TABLE interview_notes
      ADD CONSTRAINT interview_notes_doc_id_fkey
      FOREIGN KEY (doc_id)
      REFERENCES docs(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_interview_notes_doc_id_unique
  ON interview_notes(doc_id);

ALTER TABLE interview_notes
  ALTER COLUMN doc_id SET NOT NULL;
