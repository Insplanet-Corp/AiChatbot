// 이력서 원본 데이터 구조(앱 내부 메모리 표현).
// LLM 파싱 결과이며, 저장 시 resumes 테이블의 평문 컬럼/JSONB 로 분해된다(utils/resumeMapper.ts).
// 모든 필드를 optional 로 둔 이유: LLM 파싱/레거시 데이터에 따라 누락될 수 있기 때문.

export interface ResumePersonalInfo {
  name?: string;
  email?: string;
  phone?: string;
  birth_date?: string;
  gender?: string;
  address?: string;
  region?: string; // address 에서 추출한 시/도 (서울/경기/부산 …). 정규화 시 자동 산출.
  profile_image_url?: string;
  desired_position?: string;
}

export interface ResumeProfessionalSummary {
  job_category?: string;
  current_role?: string;
  total_experience_months?: number;
  skill_grade?: string;
  major_achievement?: string;
  core_competencies?: string[];
  introduction?: string;
  desired_position?: string;
  desired_salary?: string;
  // desired_salary 원문에서 구조화한 값 (정규화 시 자동 산출).
  desired_salary_amount?: number; // 금액(만원 단위). 예: "3,500만원" → 3500
  desired_salary_period?: string; // "연" | "월"(단가). 불명확하면 미설정.
  desired_salary_negotiable?: boolean; // 협의/면접 후 결정 등
}

export interface ResumeSkill {
  skill_name?: string;
  proficiency_level?: string;
  notes?: string;
}

export interface ResumeWorkExperience {
  start_date?: string;
  end_date?: string;
  company_name?: string;
  department?: string;
  job_title?: string;
  responsibilities?: string;
  tech_stack?: string[];
  key_achievements?: string[];
}

export interface ResumeProject {
  start_date?: string;
  end_date?: string;
  project_name?: string;
  client_company?: string;
  role_and_tasks?: string;
  tech_stack?: string[];
  outcomes?: string;
  scale?: string;
}

export interface ResumeEducation {
  start_date?: string;
  end_date?: string;
  school_name?: string;
  major?: string;
  graduation_status?: string;
}

export interface ResumeCertification {
  certification_name?: string;
  issuer?: string;
  acquisition_date?: string;
}

// skills / certifications 는 객체 또는 문자열로 들어올 수 있어 유니온으로 둔다.
export type ResumeSkillItem = ResumeSkill | string;
export type ResumeCertificationItem = ResumeCertification | string;

export interface ResumeLanguage {
  language?: string;
  test_name?: string;
  score?: string;
  acquisition_date?: string;
}

export interface ResumeAward {
  competition_name?: string;
  award_name?: string;
  host_organization?: string;
  award_date?: string;
}

export interface ResumeData {
  personal_info?: ResumePersonalInfo;
  professional_summary?: ResumeProfessionalSummary;
  file_grade?: string;
  evaluation?: { one_line_review?: string };
  skills?: ResumeSkillItem[];
  work_experiences?: ResumeWorkExperience[];
  projects?: ResumeProject[];
  education?: ResumeEducation[]; // 레거시 키 (educations 이전 데이터 호환)
  educations?: ResumeEducation[];
  certifications?: ResumeCertificationItem[];
  languages?: ResumeLanguage[];
  awards?: ResumeAward[];
  // 일부 이력서는 자격/역량을 abilities 로 추출 (문자열 또는 { desc } 객체)
  abilities?: Array<{ desc?: string } | string>;
}

// resumes 테이블 row (세분화 후: 평문 컬럼 + JSONB 목록).
// 컬럼 ↔ ResumeData 변환은 utils/resumeMapper.ts 참고.
// JSON 의 current_role 은 SQL 예약어라 컬럼명은 current_position.
export interface ResumeRow {
  id: string;
  name: string;
  job_category?: string;
  total_experience_months?: number;
  rating?: number;
  created_at?: string;

  // personal_info
  email?: string;
  phone?: string;
  birth_date?: string;
  gender?: string;
  address?: string;
  region?: string; // address 에서 추출한 시/도
  profile_image_url?: string;

  // professional_summary
  current_position?: string; // = ResumeData.professional_summary.current_role
  skill_grade?: string;
  file_grade?: string;
  major_achievement?: string;
  introduction?: string;
  desired_position?: string;
  desired_salary?: string;
  desired_salary_amount?: number; // 만원 단위
  desired_salary_period?: string; // "연" | "월"
  desired_salary_negotiable?: boolean;

  // evaluation
  one_line_review?: string;

  // JSONB 목록 섹션
  core_competencies?: string[];
  skills?: ResumeSkillItem[];
  work_experiences?: ResumeWorkExperience[];
  projects?: ResumeProject[];
  educations?: ResumeEducation[];
  certifications?: ResumeCertificationItem[];
  languages?: ResumeLanguage[];
  awards?: ResumeAward[];
  abilities?: Array<{ desc?: string } | string>;

  // 이력서 유효성: 이메일이 추출되면 true, 없으면 false (이력서가 아닐 가능성 있음)
  is_valid_resume?: boolean;

  // match_resumes RPC 결과에만 존재
  similarity?: number;
}
