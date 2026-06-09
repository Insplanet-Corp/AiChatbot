// resumes 테이블(세분화된 평문 컬럼/JSONB) ↔ ResumeData(메모리 표현) 매핑.
//
// 설계: ResumeData 는 앱 내부 표현 그대로 두고 "저장 계층"만 컬럼/JSONB 로 바꾼다.
//  - 쓰기: resumeDataToColumns(rd)  → insert/update 컬럼
//  - 읽기: rowToResumeData(row)      → ResumeData 재조립 (카드 매핑/다운로드 등 다운스트림 무변경)
// 주의: JSON 의 professional_summary.current_role 은 SQL 예약어라 컬럼명은 current_position.
// (scripts/*.mjs 에도 동일 매핑이 중복되어 있으니 수정 시 함께 변경: seedResumesToDB.mjs / migrateResumesPlaintext.mjs)
import type { ResumeData, ResumeRow } from "../types/resume";

// 카드/목록 렌더에 필요한 컬럼 (embedding·resume_data 제외 — 페이로드 절약)
export const RESUME_CARD_COLUMNS =
  "id, name, job_category, total_experience_months, rating, created_at, " +
  "email, phone, birth_date, gender, address, profile_image_url, " +
  "current_position, skill_grade, file_grade, major_achievement, introduction, desired_position, desired_salary, " +
  "one_line_review, is_valid_resume, core_competencies, skills, work_experiences, projects, educations, certifications, languages, awards, abilities";

export const resumeDataToColumns = (rd: ResumeData) => {
  const pi = rd?.personal_info ?? {};
  const ps = rd?.professional_summary ?? {};
  return {
    email: pi.email ?? null,
    phone: pi.phone ?? null,
    birth_date: pi.birth_date ?? null,
    gender: pi.gender ?? null,
    address: pi.address ?? null,
    profile_image_url: pi.profile_image_url ?? null,
    current_position: ps.current_role ?? null,
    skill_grade: ps.skill_grade ?? null,
    file_grade: rd?.file_grade ?? null,
    major_achievement: ps.major_achievement ?? null,
    introduction: ps.introduction ?? null,
    desired_position: ps.desired_position ?? pi.desired_position ?? null,
    desired_salary: ps.desired_salary ?? null,
    one_line_review: rd?.evaluation?.one_line_review ?? null,
    core_competencies: ps.core_competencies ?? [],
    skills: rd?.skills ?? [],
    work_experiences: rd?.work_experiences ?? [],
    projects: rd?.projects ?? [],
    educations: rd?.educations ?? rd?.education ?? [],
    certifications: rd?.certifications ?? [],
    languages: rd?.languages ?? [],
    awards: rd?.awards ?? [],
    abilities: rd?.abilities ?? [],
  };
};

// resumeDataToColumns 는 ResumeData 에서 오는 필드만 다루고, is_valid_resume 는
// 서비스 계층(resumeService.ts)에서 이메일 추출 결과를 보고 별도로 insert 에 넘긴다.

export const rowToResumeData = (row: ResumeRow): ResumeData => ({
  personal_info: {
    name: row.name,
    email: row.email,
    phone: row.phone,
    birth_date: row.birth_date,
    gender: row.gender,
    address: row.address,
    profile_image_url: row.profile_image_url,
    desired_position: row.desired_position,
  },
  professional_summary: {
    job_category: row.job_category,
    current_role: row.current_position,
    total_experience_months: row.total_experience_months,
    skill_grade: row.skill_grade,
    major_achievement: row.major_achievement,
    core_competencies: row.core_competencies ?? [],
    introduction: row.introduction,
    desired_position: row.desired_position,
    desired_salary: row.desired_salary,
  },
  file_grade: row.file_grade,
  evaluation: { one_line_review: row.one_line_review },
  skills: row.skills ?? [],
  work_experiences: row.work_experiences ?? [],
  projects: row.projects ?? [],
  educations: row.educations ?? [],
  certifications: row.certifications ?? [],
  languages: row.languages ?? [],
  awards: row.awards ?? [],
  abilities: row.abilities ?? [],
});
