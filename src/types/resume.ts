// 이력서(resume_data) 원본 데이터 구조.
// LLM 파싱 결과이자 DB(resumes.resume_data)에 암호화되어 저장되는 JSON 스키마와 대응된다.
// 모든 필드를 optional 로 둔 이유: LLM 파싱/레거시 데이터에 따라 누락될 수 있기 때문.

export interface ResumePersonalInfo {
  name?: string;
  email?: string;
  phone?: string;
  birth_date?: string;
  gender?: string;
  address?: string;
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

export interface ResumeData {
  personal_info?: ResumePersonalInfo;
  professional_summary?: ResumeProfessionalSummary;
  evaluation?: { one_line_review?: string };
  skills?: ResumeSkillItem[];
  work_experiences?: ResumeWorkExperience[];
  projects?: ResumeProject[];
  education?: ResumeEducation[]; // 레거시 키 (educations 이전 데이터 호환)
  educations?: ResumeEducation[];
  certifications?: ResumeCertificationItem[];
  // 일부 이력서는 자격/역량을 abilities 로 추출 (문자열 또는 { desc } 객체)
  abilities?: Array<{ desc?: string } | string>;
}

// resumes 테이블 row.
// 벡터 검색 RPC(match_resumes)는 work_experiences/projects 를 최상위로 함께 반환한다.
export interface ResumeRow {
  id: string;
  name: string;
  resume_data: unknown; // 암호문(string) 또는 평문 객체
  total_experience_months?: number;
  job_category?: string;
  rating?: number;
  created_at?: string;
  work_experiences?: ResumeWorkExperience[];
  projects?: ResumeProject[];
}
