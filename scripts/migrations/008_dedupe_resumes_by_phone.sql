-- 전화번호 중복 이력서 정리
-- 같은 전화번호(숫자만 추출) = 동일인 중복 업로드로 간주하고, 그룹마다 1건만 남긴다.
--
-- 남길 레코드(KEEP) 선정 기준:
--   1순위 내용 충실도 점수 = work/edu/skill/project/cert/lang/award 항목 수 합
--          + 이메일 보유(1) + 생년월일 보유(1)
--   2순위 created_at 최신
--   3순위 id 사전순
--   → 나머지(rn > 1)는 DELETE.
--
-- 안전장치:
--   - 삭제 대상은 resumes_dedupe_backup 테이블로 먼저 백업한 뒤 삭제한다.
--   - 전체를 트랜잭션으로 감싸 중간 실패 시 자동 롤백.
--   - 전화번호가 없는 레코드는 건드리지 않는다(동명이인 삭제 위험 방지).
--   - resumes 를 참조하는 FK 는 resume_comments(ON DELETE CASCADE) 뿐이며 현재 0건이라 부수 영향 없음.
--
-- 실행 전 미리보기(어떤 행이 KEEP/DELETE 되는지 확인만, 변경 없음):
--   아래 ranked/dup CTE 와 동일한 쿼리로 rn=1 → KEEP, rn>1 → DELETE 를 조회할 수 있다.
--
-- 적용:  docker exec -i supabase-db psql -U postgres -d postgres < scripts/migrations/008_dedupe_resumes_by_phone.sql
-- 복구:  INSERT INTO public.resumes SELECT * FROM public.resumes_dedupe_backup;
--        DROP TABLE public.resumes_dedupe_backup;   -- 확인 끝나면 백업 테이블 정리

BEGIN;

-- 1) 삭제 대상 백업 (복구용 스냅샷). 재실행 대비 기존 백업이 있으면 비우고 다시 채운다.
DROP TABLE IF EXISTS public.resumes_dedupe_backup;

CREATE TABLE public.resumes_dedupe_backup AS
WITH ranked AS (
  SELECT id, created_at,
    regexp_replace(phone, '[^0-9]', '', 'g') AS phone_norm,
    ( jsonb_array_length(COALESCE(work_experiences, '[]'))
    + jsonb_array_length(COALESCE(educations,       '[]'))
    + jsonb_array_length(COALESCE(skills,           '[]'))
    + jsonb_array_length(COALESCE(projects,         '[]'))
    + jsonb_array_length(COALESCE(certifications,   '[]'))
    + jsonb_array_length(COALESCE(languages,        '[]'))
    + jsonb_array_length(COALESCE(awards,           '[]'))
    + (email IS NOT NULL AND btrim(email) <> '')::int
    + (birth_date IS NOT NULL)::int ) AS score
  FROM public.resumes
  WHERE phone IS NOT NULL AND regexp_replace(phone, '[^0-9]', '', 'g') <> ''
),
dup AS (
  SELECT id,
    row_number() OVER (PARTITION BY phone_norm ORDER BY score DESC, created_at DESC, id) AS rn
  FROM ranked
)
SELECT r.*
FROM public.resumes r
JOIN dup d ON d.id = r.id
WHERE d.rn > 1;

-- 2) 중복 삭제 (백업과 동일 로직으로 rn>1 만 제거)
WITH ranked AS (
  SELECT id, created_at,
    regexp_replace(phone, '[^0-9]', '', 'g') AS phone_norm,
    ( jsonb_array_length(COALESCE(work_experiences, '[]'))
    + jsonb_array_length(COALESCE(educations,       '[]'))
    + jsonb_array_length(COALESCE(skills,           '[]'))
    + jsonb_array_length(COALESCE(projects,         '[]'))
    + jsonb_array_length(COALESCE(certifications,   '[]'))
    + jsonb_array_length(COALESCE(languages,        '[]'))
    + jsonb_array_length(COALESCE(awards,           '[]'))
    + (email IS NOT NULL AND btrim(email) <> '')::int
    + (birth_date IS NOT NULL)::int ) AS score
  FROM public.resumes
  WHERE phone IS NOT NULL AND regexp_replace(phone, '[^0-9]', '', 'g') <> ''
),
dup AS (
  SELECT id,
    row_number() OVER (PARTITION BY phone_norm ORDER BY score DESC, created_at DESC, id) AS rn
  FROM ranked
)
DELETE FROM public.resumes
WHERE id IN (SELECT id FROM dup WHERE rn > 1);

-- 3) 검증: 남은 전화번호 중복이 0건이어야 한다. (있으면 의도와 다른 상태이므로 예외 발생 → 롤백)
DO $$
DECLARE remaining int;
BEGIN
  SELECT count(*) INTO remaining FROM (
    SELECT regexp_replace(phone, '[^0-9]', '', 'g') AS p
    FROM public.resumes
    WHERE phone IS NOT NULL AND regexp_replace(phone, '[^0-9]', '', 'g') <> ''
    GROUP BY 1 HAVING count(*) > 1
  ) q;
  RAISE NOTICE '백업 건수=%, 남은 전화번호 중복 그룹=%',
    (SELECT count(*) FROM public.resumes_dedupe_backup), remaining;
  IF remaining > 0 THEN
    RAISE EXCEPTION '전화번호 중복이 아직 % 그룹 남아있음 — 롤백', remaining;
  END IF;
END $$;

COMMIT;
