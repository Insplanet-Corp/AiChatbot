-- 암호문 resume_data 컬럼 제거 (세분화 평문 컬럼으로 이전 완료 후 실행)
-- 선행: 001(컬럼 추가) + migrateResumesPlaintext.mjs(데이터 이전) + 002(RPC 교체) + 앱 빌드 통과
-- 적용: docker exec -i supabase-db psql -U supabase_admin -d postgres < scripts/migrations/003_drop_resume_data.sql
-- 복구 필요 시 backups/resumes_backup_*.sql 사용.

ALTER TABLE public.resumes DROP COLUMN IF EXISTS resume_data;
