-- 주소→지역(시/도), 희망급여 자유문구→구조화(금액/기간/협의) 컬럼 추가 + 기존 행 백필.
-- 앱 저장 경로(src/utils/resumeNormalize.ts)에서 채워지며, 이미 저장된 행은 아래 백필로 정리한다.
-- 멱등(idempotent): 재실행해도 안전.
-- 적용: docker exec -i supabase-db psql -U postgres -d postgres < scripts/migrations/006_structure_region_salary.sql

BEGIN;

ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS region                    text,     -- 시/도 (서울/경기/부산 …)
  ADD COLUMN IF NOT EXISTS desired_salary_amount     integer,  -- 만원 단위
  ADD COLUMN IF NOT EXISTS desired_salary_period     text,     -- "연" | "월"
  ADD COLUMN IF NOT EXISTS desired_salary_negotiable boolean;  -- 협의/면접 후 결정

-- 1) region: 주소 첫 토큰(시도 접두어)에서 광역시/도 추출
UPDATE public.resumes SET region = CASE
  WHEN split_part(btrim(address), ' ', 1) ~ '^서울'           THEN '서울'
  WHEN split_part(btrim(address), ' ', 1) ~ '^부산'           THEN '부산'
  WHEN split_part(btrim(address), ' ', 1) ~ '^대구'           THEN '대구'
  WHEN split_part(btrim(address), ' ', 1) ~ '^인천'           THEN '인천'
  WHEN split_part(btrim(address), ' ', 1) ~ '^광주'           THEN '광주'
  WHEN split_part(btrim(address), ' ', 1) ~ '^대전'           THEN '대전'
  WHEN split_part(btrim(address), ' ', 1) ~ '^울산'           THEN '울산'
  WHEN split_part(btrim(address), ' ', 1) ~ '^세종'           THEN '세종'
  WHEN split_part(btrim(address), ' ', 1) ~ '^경기'           THEN '경기'
  WHEN split_part(btrim(address), ' ', 1) ~ '^강원'           THEN '강원'
  WHEN split_part(btrim(address), ' ', 1) ~ '^(충북|충청북)'  THEN '충북'
  WHEN split_part(btrim(address), ' ', 1) ~ '^(충남|충청남)'  THEN '충남'
  WHEN split_part(btrim(address), ' ', 1) ~ '^(전북|전라북)'  THEN '전북'
  WHEN split_part(btrim(address), ' ', 1) ~ '^(전남|전라남)'  THEN '전남'
  WHEN split_part(btrim(address), ' ', 1) ~ '^(경북|경상북)'  THEN '경북'
  WHEN split_part(btrim(address), ' ', 1) ~ '^(경남|경상남)'  THEN '경남'
  WHEN split_part(btrim(address), ' ', 1) ~ '^제주'           THEN '제주'
  ELSE NULL
END
WHERE address IS NOT NULL;

-- 2) desired_salary 구조화 (금액/기간/협의)
WITH parsed AS (
  SELECT id,
    (desired_salary ~ '협의|면접|추후|별도|결정|상담') AS neg,
    CASE WHEN desired_salary ~ '월|단가'   THEN '월'
         WHEN desired_salary ~ '연봉|연|年' THEN '연' END AS per,
    regexp_match(replace(desired_salary, ',', ''), '(\d+(\.\d+)?)\s*(억|천만|천|만)?') AS m
  FROM public.resumes
  WHERE desired_salary IS NOT NULL
)
UPDATE public.resumes r SET
  desired_salary_negotiable = p.neg,
  desired_salary_period     = p.per,
  desired_salary_amount = CASE
    WHEN p.m IS NULL OR p.m[1] IS NULL THEN NULL
    WHEN p.m[3] = '억'            THEN round(p.m[1]::numeric * 10000)
    WHEN p.m[3] IN ('천만', '천') THEN round(p.m[1]::numeric * 1000)
    ELSE round(p.m[1]::numeric)
  END
FROM parsed p
WHERE r.id = p.id;

COMMIT;
