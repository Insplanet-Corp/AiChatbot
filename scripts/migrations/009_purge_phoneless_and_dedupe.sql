-- 전화번호 없는 이력서 삭제 + 전화번호 중복 정리 (통합)
-- 정책:
--   (1) 전화번호(숫자만 추출)가 비어있는 레코드는 전부 삭제한다.
--   (2) 전화번호가 있는 레코드 중 같은 번호가 여러 건이면, 내용 충실도 점수가
--       가장 높은 1건만 남기고(KEEP) 나머지는 삭제한다.
--       점수 = work/edu/skill/project/cert/lang/award 항목 수 합 + 이메일 보유(1) + 생년월일 보유(1)
--       동점 시 created_at 최신 → id 사전순.
--
-- 주의: (1)에는 전화번호만 추출 실패했을 뿐 경력·학력·스킬이 정상 파싱된 이력서도 포함된다.
--        삭제 전 resumes_dedupe_backup 으로 전량 백업하므로 복구는 가능하다.
--
-- 안전장치: 트랜잭션으로 감싸고, 검증 실패 시 자동 롤백. resumes 외 참조 테이블 없음.
--
-- 적용(PowerShell):
--   Get-Content scripts/migrations/009_purge_phoneless_and_dedupe.sql -Raw | docker exec -i supabase-db psql -U postgres -d postgres
-- 적용(bash):
--   docker exec -i supabase-db psql -U postgres -d postgres < scripts/migrations/009_purge_phoneless_and_dedupe.sql
-- 복구:
--   docker exec -i supabase-db psql -U postgres -d postgres -c "INSERT INTO public.resumes SELECT * FROM public.resumes_dedupe_backup;"

BEGIN;

-- 0) 삭제 대상 식별 CTE 를 임시뷰처럼 쓰기 위해 임시 테이블에 적재
DROP TABLE IF EXISTS public.resumes_dedupe_backup;

CREATE TEMP TABLE _to_delete ON COMMIT DROP AS
WITH base AS (
  SELECT id, created_at,
    regexp_replace(COALESCE(phone,''), '[^0-9]', '', 'g') AS phone_norm,
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
),
ranked AS (
  SELECT id, phone_norm,
    CASE WHEN phone_norm <> ''
         THEN row_number() OVER (PARTITION BY phone_norm ORDER BY score DESC, created_at DESC, id)
         ELSE NULL END AS rn
  FROM base
)
SELECT id,
       CASE WHEN phone_norm = '' THEN 'no_phone' ELSE 'dup' END AS reason
FROM ranked
WHERE phone_norm = ''   -- (1) 전화번호 없음
   OR rn > 1;           -- (2) 전화번호 중복 잉여분

-- 1) 백업 (복구용 스냅샷)
CREATE TABLE public.resumes_dedupe_backup AS
SELECT r.* FROM public.resumes r JOIN _to_delete d ON d.id = r.id;

-- 2) 삭제
DELETE FROM public.resumes
WHERE id IN (SELECT id FROM _to_delete);

-- 3) 검증: 전화없음 0건 AND 전화중복 0그룹 이어야 한다.
DO $$
DECLARE no_phone int; dup_groups int;
BEGIN
  SELECT count(*) INTO no_phone
    FROM public.resumes
    WHERE regexp_replace(COALESCE(phone,''), '[^0-9]', '', 'g') = '';

  SELECT count(*) INTO dup_groups FROM (
    SELECT regexp_replace(phone, '[^0-9]', '', 'g') AS p
    FROM public.resumes
    WHERE phone IS NOT NULL AND regexp_replace(phone, '[^0-9]', '', 'g') <> ''
    GROUP BY 1 HAVING count(*) > 1
  ) q;

  RAISE NOTICE '삭제 백업=% 건, 남은 전화없음=% 건, 남은 전화중복 그룹=%',
    (SELECT count(*) FROM public.resumes_dedupe_backup), no_phone, dup_groups;

  IF no_phone > 0 OR dup_groups > 0 THEN
    RAISE EXCEPTION '검증 실패(전화없음=%, 중복그룹=%) — 롤백', no_phone, dup_groups;
  END IF;
END $$;

COMMIT;
