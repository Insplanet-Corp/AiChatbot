-- resumes 테이블 세분화: 암호문 resume_data(JSON) → 평문 컬럼 + JSONB 컬럼
-- 적용: docker exec -i supabase-db psql -U postgres -d postgres < scripts/migrations/001_denormalize_resumes.sql
-- 주의: resume_data 컬럼은 데이터 이전(scripts/migrateResumesPlaintext.mjs) 완료 후 003 에서 DROP 한다.

BEGIN;

ALTER TABLE public.resumes
  -- personal_info
  ADD COLUMN IF NOT EXISTS email             text,
  ADD COLUMN IF NOT EXISTS phone             text,
  ADD COLUMN IF NOT EXISTS birth_date        text,
  ADD COLUMN IF NOT EXISTS gender            text,
  ADD COLUMN IF NOT EXISTS address           text,
  ADD COLUMN IF NOT EXISTS profile_image_url text,
  -- professional_summary  (current_role 은 SQL 예약어라 current_position 으로 둔다)
  ADD COLUMN IF NOT EXISTS current_position  text,
  ADD COLUMN IF NOT EXISTS skill_grade       text,
  ADD COLUMN IF NOT EXISTS file_grade        text,
  ADD COLUMN IF NOT EXISTS major_achievement text,
  ADD COLUMN IF NOT EXISTS introduction      text,
  ADD COLUMN IF NOT EXISTS desired_position  text,
  ADD COLUMN IF NOT EXISTS desired_salary    text,
  -- evaluation
  ADD COLUMN IF NOT EXISTS one_line_review   text,
  -- 배열/목록 섹션 (읽을 수 있는 JSONB)
  ADD COLUMN IF NOT EXISTS core_competencies jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS skills            jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS work_experiences  jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS projects          jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS educations        jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS certifications    jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS languages         jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS awards            jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS abilities         jsonb DEFAULT '[]'::jsonb;

COMMIT;
