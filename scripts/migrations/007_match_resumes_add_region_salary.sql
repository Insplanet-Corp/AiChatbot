-- match_resumes RPC: region / 구조화된 희망급여(금액·기간·협의) 컬럼을 반환에 추가.
-- 반환 타입이 바뀌므로 DROP 후 재생성. (002_update_match_resumes.sql 의 후속)
-- 적용: docker exec -i supabase-db psql -U supabase_admin -d postgres < scripts/migrations/007_match_resumes_add_region_salary.sql

DROP FUNCTION IF EXISTS public.match_resumes(vector, double precision, integer);

CREATE FUNCTION public.match_resumes(
  query_embedding vector,
  match_threshold double precision,
  match_count integer
)
RETURNS TABLE(
  id uuid,
  name text,
  job_category text,
  total_experience_months integer,
  rating integer,
  email text,
  phone text,
  birth_date text,
  gender text,
  address text,
  region text,
  profile_image_url text,
  current_position text,
  skill_grade text,
  file_grade text,
  major_achievement text,
  introduction text,
  desired_position text,
  desired_salary text,
  desired_salary_amount integer,
  desired_salary_period text,
  desired_salary_negotiable boolean,
  one_line_review text,
  core_competencies jsonb,
  skills jsonb,
  work_experiences jsonb,
  projects jsonb,
  educations jsonb,
  certifications jsonb,
  languages jsonb,
  awards jsonb,
  abilities jsonb,
  similarity double precision
)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    r.id, r.name, r.job_category, r.total_experience_months, r.rating,
    r.email, r.phone, r.birth_date, r.gender, r.address, r.region, r.profile_image_url,
    r.current_position, r.skill_grade, r.file_grade, r.major_achievement,
    r.introduction, r.desired_position, r.desired_salary,
    r.desired_salary_amount, r.desired_salary_period, r.desired_salary_negotiable,
    r.one_line_review,
    r.core_competencies, r.skills, r.work_experiences, r.projects,
    r.educations, r.certifications, r.languages, r.awards, r.abilities,
    1 - (r.embedding <=> query_embedding) AS similarity
  FROM public.resumes r
  WHERE 1 - (r.embedding <=> query_embedding) > match_threshold
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$;
