import { supabase } from "../utils/supabase";
import { rowToResumeData } from "../utils/resumeMapper";
import { SERVICE_NAME, JOB_CATEGORIES, type JobCategory } from "../constants/service";
import { formatExperience } from "../utils/formatters";
import type {
  ResumeData,
  ResumeRow,
  ResumeSkillItem,
  ResumeCertificationItem,
  ResumeWorkExperience,
  ResumeProject,
} from "../types/resume";

// -------------------------------------------------------
// Shared card data shape used by CandidateCard component
// -------------------------------------------------------
export interface CandidateCardData {
  id: string;
  name: string;
  profile_image: string | null;
  introduction: string;
  is_kosa_verified: boolean;
  basic_info: {
    category: JobCategory | null;
    grade: string | null;
    experience_total: string;
    birth_year: number | null;
  };
  details: {
    final_education: string;
    qualifications: string[];
    major_experience: string;
    skills: string[];
    internal_rating: number;
  };
  flags: {
    has_finance_experience: boolean;
    has_it_certificate: boolean;
  };
}

// -------------------------------------------------------
// row → { rd, name } (mapRowToCardData / fetchAndDecryptCandidate 공용)
// 세분화된 평문 컬럼/JSONB 에서 ResumeData 를 재조립한다. (복호화 없음)
// -------------------------------------------------------
const resumeFromRow = (row: ResumeRow): { rd: ResumeData; name: string } => {
  const rd = rowToResumeData(row);
  const name = row.name || rd?.personal_info?.name || "이름 없음";
  return { rd, name };
};

// 프로필 이미지 URL 정리 (flaticon placeholder 는 null 처리)
const getProfileImage = (rd: ResumeData): string | null => {
  const url = rd?.personal_info?.profile_image_url;
  if (!url || url.includes("flaticon.com")) return null;
  return url;
};

// birth_date("YYYY...") → 출생연도(number) | null
const parseBirthYear = (rd: ResumeData): number | null =>
  rd?.personal_info?.birth_date
    ? parseInt(rd.personal_info.birth_date.substring(0, 4))
    : null;

// skill/certification 항목은 객체 또는 문자열로 들어올 수 있어 이름만 안전하게 추출
const skillName = (item: ResumeSkillItem): string =>
  typeof item === "string" ? item : item.skill_name || "";

const certName = (item: ResumeCertificationItem): string =>
  typeof item === "string" ? item : item.certification_name || "";

const getSkillNames = (rd: ResumeData): string[] =>
  Array.isArray(rd?.skills) ? rd.skills.map(skillName).filter(Boolean) : [];

const getCertificationNames = (rd: ResumeData): string[] =>
  Array.isArray(rd?.certifications)
    ? rd.certifications.map(certName).filter(Boolean)
    : [];

// 한 줄 요약평 → 자기소개 순으로 우선 사용, 둘 다 없으면 fallback
const getIntroduction = (rd: ResumeData, fallback: string): string =>
  rd?.evaluation?.one_line_review ||
  rd?.professional_summary?.introduction ||
  fallback;

const FINANCE_KEYWORDS = ["은행", "증권", "보험", "카드", "캐피탈", "저축", "금융", "투자", "자산", "신탁", "리스", "할부", "대출"];
const IT_CERT_KEYWORDS = ["정보처리기능사", "정보처리산업기사", "정보처리기사"];

// LLM이 자유형식으로 생성한 job_category를 4개 표준 탭 카테고리로 분류
// 문자열에서 각 카테고리 키워드가 가장 앞에 등장하는 위치 기준으로 선택
const CATEGORY_KEYWORDS: { category: JobCategory; keywords: string[] }[] = [
  {
    category: "퍼블리싱",
    keywords: ["퍼블리셔", "퍼블리싱", "publisher", "publishing"],
  },
  {
    category: "개발",
    keywords: [
      "개발자", "개발", "developer", "engineer", "엔지니어",
      "프론트엔드", "백엔드", "풀스택", "frontend", "backend", "fullstack",
      "프로그래머", "programmer",
    ],
  },
  {
    category: "디자인",
    keywords: ["디자인", "디자이너", "designer", "그래픽", "graphic", "영상", "편집"],
  },
  {
    category: "기획",
    keywords: ["기획", "기획자", " pm", " po"],
  },
];

const classifyJobCategory = (rd: ResumeData | null, row: ResumeRow): JobCategory | null => {
  const texts = [
    row.job_category,
    rd?.personal_info?.desired_position,
    rd?.professional_summary?.job_category,
    rd?.professional_summary?.current_role,
    rd?.professional_summary?.desired_position,
    ...(rd?.professional_summary?.core_competencies ?? []),
    ...(Array.isArray(rd?.work_experiences)
      ? rd.work_experiences.flatMap((w) => [w.job_title, w.department, w.responsibilities])
      : []),
    ...(Array.isArray(rd?.projects)
      ? rd.projects.map((p) => p.role_and_tasks)
      : []),
  ].filter(Boolean).join(" ").toLowerCase();

  let bestCategory: JobCategory | null = null;
  let bestCount = 0;

  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    let count = 0;
    for (const kw of keywords) {
      const re = new RegExp(kw.trim().toLowerCase(), "g");
      count += (texts.match(re) ?? []).length;
    }
    if (count > bestCount) {
      bestCount = count;
      bestCategory = category;
    }
  }

  return bestCategory;
};

export const mapRowToCardData = (row: ResumeRow): CandidateCardData => {
  const { rd, name } = resumeFromRow(row);

  const expLabel = formatExperience(row.total_experience_months);
  const birthYear = parseBirthYear(rd);

  const latestJob = Array.isArray(rd?.work_experiences) && rd.work_experiences[0];
  const category = classifyJobCategory(rd, row);

  const skills = getSkillNames(rd);
  const qualifications = getCertificationNames(rd);

  const finalEducation =
    Array.isArray(rd?.education) && rd.education[0]
      ? `${rd.education[0].school_name || ""} ${rd.education[0].major || ""}`.trim()
      : Array.isArray(rd?.educations) && rd.educations[0]
        ? `${rd.educations[0].school_name || ""} ${rd.educations[0].major || ""}`.trim()
        : "-";

  const majorExperience = latestJob
    ? `${latestJob.company_name || ""} / ${latestJob.job_title || ""}`.trim()
    : "-";

  const introduction = getIntroduction(rd, "");

  const has_finance_experience = Array.isArray(rd?.work_experiences) &&
    rd.work_experiences.some((w: ResumeWorkExperience) =>
      FINANCE_KEYWORDS.some((kw) =>
        (w.company_name || "").includes(kw) ||
        (w.job_title || "").includes(kw) ||
        (w.department || "").includes(kw)
      )
    );

  const has_it_certificate = qualifications.some((q) =>
    IT_CERT_KEYWORDS.some((kw) => q.includes(kw))
  );

  return {
    id: row.id,
    name,
    profile_image: getProfileImage(rd),
    introduction,
    is_kosa_verified: false,
    basic_info: {
      category,
      grade: rd.file_grade ?? null,
      experience_total: expLabel,
      birth_year: birthYear,
    },
    details: {
      final_education: finalEducation,
      qualifications,
      major_experience: majorExperience,
      skills,
      internal_rating: row.rating || 0,
    },
    flags: {
      has_finance_experience,
      has_it_certificate,
    },
  };
};

const fetchAndDecryptCandidate = async (id: string) => {
  const { data, error } = await supabase
    .from("resumes")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("후보자 데이터를 찾을 수 없습니다.");

  const { rd, name } = resumeFromRow(data);
  const months = data.total_experience_months || 0;
  const birthYear = parseBirthYear(rd);

  return {
    // 다운로드 서비스에서 원본 데이터가 필요하므로 포함
    rawResumeData: rd,
    totalExperienceMonths: months,

    name,
    experience: `경력 ${Math.floor(months / 12)}년 ${months % 12}개월`,
    age: birthYear ? `만 ${new Date().getFullYear() - birthYear}세` : "나이 미상",
    phone: rd?.personal_info?.phone || "연락처 없음",
    email: rd?.personal_info?.email || "이메일 없음",
    address: rd?.personal_info?.address || "주소 미상",
    profileImage: getProfileImage(rd),

    aiSummary: getIntroduction(rd, `${SERVICE_NAME} 요약평이 없습니다.`),
    matchScore: 82,

    skills: {
      languages: getSkillNames(rd),
      frameworks: [],
    },

    rating: data.rating || 0,
    workHistory: Array.isArray(rd?.work_experiences)
      ? rd.work_experiences.map((w: ResumeWorkExperience) => ({
          period: `${w.start_date || ""} ~ ${w.end_date || "현재"}`,
          company: w.company_name,
          role: `${w.department || ""} / ${w.job_title || ""}`,
          responsibilities: w.responsibilities || "",
          tech_stack: Array.isArray(w.tech_stack) ? w.tech_stack : [],
          key_achievements: Array.isArray(w.key_achievements) ? w.key_achievements : [],
        }))
      : [],
    majorExperience: Array.isArray(rd?.projects)
      ? rd.projects.map((p: ResumeProject) => ({
          period: `${p.start_date || ""} ~ ${p.end_date || "현재"}`,
          project: p.project_name,
          role: p.role_and_tasks,
          tech_stack: Array.isArray(p.tech_stack) ? p.tech_stack : [],
          outcomes: p.outcomes || "",
          scale: p.scale || "",
        }))
      : [],
  };
};

export { fetchAndDecryptCandidate };
