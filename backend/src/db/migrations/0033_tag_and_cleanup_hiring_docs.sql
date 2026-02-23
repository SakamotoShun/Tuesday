-- Tag linked hiring docs for reliable lifecycle cleanup

UPDATE docs AS d
SET properties = COALESCE(d.properties, '{}'::jsonb) || jsonb_build_object(
  'source', 'hiring',
  'hiringPositionId', pd.position_id::text
)
FROM position_docs AS pd
WHERE pd.doc_id = d.id;

-- Remove previously orphaned hiring docs that are already tagged
DELETE FROM docs AS d
WHERE COALESCE(d.properties->>'source', '') = 'hiring'
  AND NOT EXISTS (
    SELECT 1
    FROM position_docs AS pd
    WHERE pd.doc_id = d.id
  );
