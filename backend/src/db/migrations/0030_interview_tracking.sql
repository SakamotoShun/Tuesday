-- Interview tracking: pipeline stages, job positions, candidates, applications, interviews, notes

-- Interview pipeline stages (configurable, like task_statuses)
CREATE TABLE IF NOT EXISTS interview_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#6b7280',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default stages (idempotent)
INSERT INTO interview_stages (name, color, sort_order, is_default)
SELECT v.name, v.color, v.sort_order, v.is_default
FROM (
  VALUES
    ('Applied', '#6b7280', 0, true),
    ('Phone Screen', '#3b82f6', 1, false),
    ('Technical', '#8b5cf6', 2, false),
    ('Onsite', '#f59e0b', 3, false),
    ('Offer', '#10b981', 4, false),
    ('Hired', '#22c55e', 5, false),
    ('Rejected', '#ef4444', 6, false)
) AS v(name, color, sort_order, is_default)
WHERE NOT EXISTS (
  SELECT 1
  FROM interview_stages s
  WHERE s.name = v.name
);

-- Job positions (open roles / JDs)
CREATE TABLE IF NOT EXISTS job_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  department VARCHAR(100),
  description_md TEXT DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  hiring_manager_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hiring_positions_status ON job_positions(status);
CREATE INDEX IF NOT EXISTS idx_hiring_positions_created_by ON job_positions(created_by);

-- Candidates (people being interviewed)
CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  resume_url TEXT,
  source VARCHAR(100),
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidates_created_by ON candidates(created_by);

-- Job applications (links candidate to position + pipeline stage — the kanban card)
CREATE TABLE IF NOT EXISTS job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  position_id UUID NOT NULL REFERENCES job_positions(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES interview_stages(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_applications_position ON job_applications(position_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_candidate ON job_applications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_stage ON job_applications(stage_id);

-- Interviews (scheduled interview sessions)
CREATE TABLE IF NOT EXISTS interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  interviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  type VARCHAR(50),
  location VARCHAR(255),
  link TEXT,
  rating INTEGER,
  feedback TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interviews_application ON interviews(application_id);
CREATE INDEX IF NOT EXISTS idx_interviews_interviewer ON interviews(interviewer_id);

-- Interview notes (rich-text notes using BlockNote JSON)
CREATE TABLE IF NOT EXISTS interview_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES job_applications(id) ON DELETE CASCADE,
  interview_id UUID REFERENCES interviews(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  content JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interview_notes_application ON interview_notes(application_id);
CREATE INDEX IF NOT EXISTS idx_interview_notes_interview ON interview_notes(interview_id);
