-- 기존 resumes 레코드 값 정규화 (1회성 백필)
-- 앱 저장 경로(src/utils/resumeNormalize.ts)에 정규화 레이어를 추가하면서,
-- 이미 저장된 행들도 동일 기준으로 한 번 정리한다. 멱등(idempotent)하게 작성되어 재실행해도 안전.
-- 적용: docker exec -i supabase-db psql -U postgres -d postgres < scripts/migrations/005_normalize_existing_resumes.sql
--
-- 처리 내용
--  1) 빈 문자열/공백/"undefined" 문자열 → NULL (없는 정보가 ""로 남지 않도록)
--  2) gender   → "남"/"여" 표준화
--  3) phone    → 010-1234-5678 하이픈 표준형
--  4) birth_date → YYYY-MM-DD / YYYY-MM / YYYY (XX·00·MM 등 placeholder 제거)
--  5) skill_grade → 초급/중급/고급/특급(또는 "~급") 외 잡값 제거
--  6) profile_image_url → http(s) 아니거나 flaticon placeholder 면 제거
--  7) is_valid_resume → 이메일 유무로 재계산 (앱 로직과 동일)

BEGIN;

-- 1) 빈 문자열/공백/"undefined" → NULL (모든 평문 텍스트 컬럼)
UPDATE public.resumes SET
  email             = NULLIF(NULLIF(btrim(email), ''), 'undefined'),
  phone             = NULLIF(NULLIF(btrim(phone), ''), 'undefined'),
  birth_date        = NULLIF(NULLIF(btrim(birth_date), ''), 'undefined'),
  gender            = NULLIF(NULLIF(btrim(gender), ''), 'undefined'),
  address           = NULLIF(NULLIF(btrim(address), ''), 'undefined'),
  profile_image_url = NULLIF(NULLIF(btrim(profile_image_url), ''), 'undefined'),
  current_position  = NULLIF(NULLIF(btrim(current_position), ''), 'undefined'),
  skill_grade       = NULLIF(NULLIF(btrim(skill_grade), ''), 'undefined'),
  file_grade        = NULLIF(NULLIF(btrim(file_grade), ''), 'undefined'),
  major_achievement = NULLIF(NULLIF(btrim(major_achievement), ''), 'undefined'),
  introduction      = NULLIF(NULLIF(btrim(introduction), ''), 'undefined'),
  desired_position  = NULLIF(NULLIF(btrim(desired_position), ''), 'undefined'),
  desired_salary    = NULLIF(NULLIF(btrim(desired_salary), ''), 'undefined'),
  one_line_review   = NULLIF(NULLIF(btrim(one_line_review), ''), 'undefined');

-- 2) gender → "남"/"여"
UPDATE public.resumes SET gender = CASE
  WHEN gender ~* '^(남(자|성)?|男|m|male)$'   THEN '남'
  WHEN gender ~* '^(여(자|성)?|女|f|female)$' THEN '여'
  ELSE NULL
END
WHERE gender IS NOT NULL;

-- 3) phone → 하이픈 표준형 (숫자만 추출 후 자릿수별 포맷)
UPDATE public.resumes SET phone = CASE
  WHEN length(regexp_replace(phone, '\D', '', 'g')) = 11
    THEN regexp_replace(regexp_replace(phone, '\D', '', 'g'), '(\d{3})(\d{4})(\d{4})', '\1-\2-\3')
  WHEN length(regexp_replace(phone, '\D', '', 'g')) = 10 AND regexp_replace(phone, '\D', '', 'g') LIKE '02%'
    THEN regexp_replace(regexp_replace(phone, '\D', '', 'g'), '(\d{2})(\d{4})(\d{4})', '\1-\2-\3')
  WHEN length(regexp_replace(phone, '\D', '', 'g')) = 10
    THEN regexp_replace(regexp_replace(phone, '\D', '', 'g'), '(\d{3})(\d{3})(\d{4})', '\1-\2-\3')
  WHEN length(regexp_replace(phone, '\D', '', 'g')) = 12
    THEN regexp_replace(regexp_replace(phone, '\D', '', 'g'), '(\d{4})(\d{4})(\d{4})', '\1-\2-\3')
  ELSE phone
END
WHERE phone IS NOT NULL;

-- 4) birth_date → YYYY[-MM[-DD]] (placeholder 제거)
UPDATE public.resumes SET birth_date = CASE
  -- 이미 정상 형식이면 유지
  WHEN birth_date ~ '^(19|20)\d{2}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$'
    THEN birth_date
  -- 연도 표기 없는 6자리 YYMMDD → 30 이상은 19xx, 미만은 20xx
  WHEN birth_date ~ '^\d{6}$'
       AND substring(birth_date, 3, 2)::int BETWEEN 1 AND 12
       AND substring(birth_date, 5, 2)::int BETWEEN 1 AND 31
    THEN (CASE WHEN substring(birth_date, 1, 2)::int >= 30 THEN '19' ELSE '20' END)
         || substring(birth_date, 1, 2) || '-' || substring(birth_date, 3, 2) || '-' || substring(birth_date, 5, 2)
  -- 그 외엔 4자리 연도만 살리고 월/일(XX·00·MM 등)은 버린다
  WHEN birth_date ~ '(19|20)\d{2}'
    THEN (regexp_match(birth_date, '((19|20)\d{2})'))[1]
  ELSE NULL
END
WHERE birth_date IS NOT NULL;

-- 5) skill_grade → 초급/중급/고급/특급(또는 "~급") 외 제거
UPDATE public.resumes SET skill_grade = CASE
  WHEN btrim(skill_grade) IN ('초급', '중급', '고급', '특급') THEN btrim(skill_grade)
  WHEN btrim(skill_grade) ~ '\d' THEN NULL
  WHEN char_length(btrim(skill_grade)) <= 4 AND btrim(skill_grade) LIKE '%급' THEN btrim(skill_grade)
  ELSE NULL
END
WHERE skill_grade IS NOT NULL;

-- 6) profile_image_url → http(s) 아니거나 flaticon placeholder 면 제거
UPDATE public.resumes SET profile_image_url = NULL
WHERE profile_image_url IS NOT NULL
  AND (profile_image_url !~* '^https?://' OR profile_image_url ILIKE '%flaticon.com%');

-- 7) is_valid_resume → 이메일 유무로 재계산
UPDATE public.resumes SET is_valid_resume = (email IS NOT NULL);

COMMIT;
