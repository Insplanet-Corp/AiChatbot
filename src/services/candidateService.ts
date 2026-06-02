import { supabase } from "../utils/supabase";
import { decryptJSON } from "../utils/encrypt";
import { SERVICE_NAME } from "../constants/service";
import { formatExperience } from "../utils/formatters";

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
    category: string;
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
// 복호화 헬퍼 (mapRowToCardData / fetchAndDecryptCandidate 공용)
// -------------------------------------------------------

// resume_data 복호화: 암호문(string / { encrypted }) 또는 평문 모두 처리
const decryptResumeData = (raw: any): any => {
  try {
    if (typeof raw === "string") return decryptJSON(raw);
    if (raw?.encrypted) return decryptJSON(raw);
    return raw || {};
  } catch {
    return raw || {};
  }
};

// 이름 복호화: 실패하거나 문자열이 아니면 fallback 사용
const decryptName = (raw: string, fallback: string): string => {
  try {
    const result = decryptJSON<string>(raw);
    return typeof result === "string" ? result : fallback;
  } catch {
    return fallback;
  }
};

// row 1건을 복호화해 { rd, name } 으로 반환
const decryptRow = (row: any): { rd: any; name: string } => {
  const rd = decryptResumeData(row.resume_data);
  const name = decryptName(row.name, rd?.personal_info?.name || "이름 없음");
  return { rd, name };
};

// 프로필 이미지 URL 정리 (flaticon placeholder 는 null 처리)
const getProfileImage = (rd: any): string | null => {
  const url = rd?.personal_info?.profile_image_url;
  if (!url || url.includes("flaticon.com")) return null;
  return url;
};

// birth_date("YYYY...") → 출생연도(number) | null
const parseBirthYear = (rd: any): number | null =>
  rd?.personal_info?.birth_date
    ? parseInt(rd.personal_info.birth_date.substring(0, 4))
    : null;

const FINANCE_KEYWORDS = ["은행", "증권", "보험", "카드", "캐피탈", "저축", "금융", "투자", "자산", "신탁", "리스", "할부", "대출"];
const IT_CERT_KEYWORDS = ["정보처리기능사", "정보처리산업기사", "정보처리기사"];

export const mapRowToCardData = (row: any): CandidateCardData => {
  const { rd, name } = decryptRow(row);

  const expLabel = formatExperience(row.total_experience_months);
  const birthYear = parseBirthYear(rd);

  const latestJob = Array.isArray(rd?.work_experiences) && rd.work_experiences[0];
  const category =
    row.job_category ||
    latestJob?.job_title ||
    rd?.personal_info?.desired_position ||
    "직군 미상";

  const skills: string[] = Array.isArray(rd?.skills)
    ? rd.skills.map((s: any) => s.skill_name || s).filter(Boolean)
    : [];

  const qualifications: string[] = Array.isArray(rd?.certifications)
    ? rd.certifications.map((c: any) => c.certification_name || c).filter(Boolean)
    : [];

  const finalEducation =
    Array.isArray(rd?.education) && rd.education[0]
      ? `${rd.education[0].school_name || ""} ${rd.education[0].major || ""}`.trim()
      : Array.isArray(rd?.educations) && rd.educations[0]
        ? `${rd.educations[0].school_name || ""} ${rd.educations[0].major || ""}`.trim()
        : "-";

  const majorExperience = latestJob
    ? `${latestJob.company_name || ""} / ${latestJob.job_title || ""}`.trim()
    : "-";

  const introduction =
    rd?.evaluation?.one_line_review || rd?.professional_summary?.introduction || "";

  const has_finance_experience = Array.isArray(rd?.work_experiences) &&
    rd.work_experiences.some((w: any) =>
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

  const { rd, name } = decryptRow(data);
  const months = data.total_experience_months || 0;

  return {
    name,
    experience: `경력 ${Math.floor(months / 12)}년 ${months % 12}개월`,
    age: rd?.personal_info?.birth_date
      ? `만 ${new Date().getFullYear() - parseInt(rd.personal_info.birth_date.substring(0, 4))}세`
      : "나이 미상",
    phone: rd?.personal_info?.phone || "연락처 없음",
    email: rd?.personal_info?.email || "이메일 없음",
    address: rd?.personal_info?.address || "주소 미상",
    profileImage: getProfileImage(rd),

    aiSummary:
      rd?.evaluation?.one_line_review ||
      rd?.professional_summary?.introduction ||
      `${SERVICE_NAME} 요약평이 없습니다.`,
    matchScore: 82,

    skills: {
      languages: Array.isArray(rd?.skills)
        ? rd.skills.map((s: any) => s.skill_name)
        : [],
      frameworks: [],
    },

    rating: data.rating || 0,
    workHistory: Array.isArray(rd?.work_experiences)
      ? rd.work_experiences.map((w: any) => ({
          period: `${w.start_date || ""} ~ ${w.end_date || "현재"}`,
          company: w.company_name,
          role: `${w.department || ""} / ${w.job_title || ""}`,
          responsibilities: w.responsibilities || "",
          tech_stack: Array.isArray(w.tech_stack) ? w.tech_stack : [],
          key_achievements: Array.isArray(w.key_achievements) ? w.key_achievements : [],
        }))
      : [],
    majorExperience: Array.isArray(rd?.projects)
      ? rd.projects.map((p: any) => ({
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
