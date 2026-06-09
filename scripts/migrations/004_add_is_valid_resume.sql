-- 이력서 유효성 컬럼 추가
-- 이메일 주소가 없으면 이력서가 아닐 확률이 높으므로 파싱/저장 시 판단해 기록한다.
-- true  = 이메일이 확인된 정상 이력서
-- false = 이메일 없음 → 이력서가 아닐 가능성 있음 (참고용, 저장은 그대로 유지)
-- 기존 레코드는 모두 true(정상)로 초기화.
-- 적용: docker exec -i supabase-db psql -U postgres -d postgres < scripts/migrations/004_add_is_valid_resume.sql

ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS is_valid_resume boolean NOT NULL DEFAULT true;
