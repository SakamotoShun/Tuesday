-- Remove legacy position doc type classification

DROP INDEX IF EXISTS idx_position_docs_doc_type;

ALTER TABLE position_docs
  DROP COLUMN IF EXISTS doc_type;
