// 이력서 파싱 결과(ResumeData) 정규화 레이어.
//
// 목적: LLM/OCR 이 뽑아낸 값을 "필드 의미에 맞는 표준 형태"로 다듬고,
//       값이 없는 필드는 빈 문자열/placeholder 가 아니라 undefined 로 비워
//       DB 에 깔끔하게(없는 정보는 안 들어가도록) 저장되게 한다.
//   - 전화번호 → 010-1234-5678 형태
//   - 성별     → "남" / "여"
//   - 생년월일 → YYYY-MM-DD / YYYY-MM / YYYY (XX·00·MM 등 placeholder 제거)
//   - 기술등급 → 초급/중급/고급/특급(또는 "~급") 외 잡값 제거
//   - 프로필 URL → http(s) 가 아니거나 placeholder(flaticon) 면 제거
//   - 배열(기술/핵심역량/tech_stack 등) → 공백 제거·중복 제거·빈 항목 제거
//
// 저장 직전 resumeService.parseAndSaveResume / seed 스크립트에서 호출한다.
// (scripts/seedResumesToDB.mjs 에 동일 로직이 중복되어 있으니 수정 시 함께 변경)
import type {
  ResumeData,
  ResumeWorkExperience,
  ResumeProject,
  ResumeSkillItem,
  ResumeCertificationItem,
  ResumeLanguage,
  ResumeAward,
} from "../types/resume";

// 공백만이거나 비어 있으면 undefined, 그 외엔 trim 한 문자열.
const clean = (v?: string | null): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
};

// 이름 정규화: 한글 음절형("홍 길 동")은 내부 공백 제거 → "홍길동".
// 영문 이름("John Smith")은 단어 사이 공백을 유지하되 중복 공백만 축약.
const cleanName = (v?: string | null): string | undefined => {
  const t = clean(v);
  if (!t) return undefined;
  return /^[가-힣\s]+$/.test(t) ? t.replace(/\s+/g, "") : t.replace(/\s+/g, " ");
};

// 문자열 배열 정규화: 공백 trim · 빈 항목 제거 · 대소문자 무시 중복 제거(순서 유지).
const cleanStringArray = (arr?: unknown): string[] => {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr) {
    const t = typeof item === "string" ? item.trim() : "";
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
};

// 원문에서 "업무경력 N년 M개월" 표기를 찾아 총 개월수로 환산. 없으면 undefined.
// LLM 의 총경력 산술 오류(예: "26년 5개월"을 324로 계산)를 보정하는 결정적 우선값.
export const extractExperienceMonths = (text?: string): number | undefined => {
  if (!text) return undefined;
  // 1순위: "업무경력/총경력/경력기간" 라벨 바로 뒤의 "N년 [M개월]"
  const labeled = text.match(
    /(?:업무\s*경력|총\s*경력|경력\s*기간)[\s:]*(\d{1,2})\s*년(?:\s*(\d{1,2})\s*개월)?/,
  );
  // 2순위: 라벨이 없으면 "N년 M개월"(개월까지 명시된 형태만 — 프로젝트 내 "3년" 오인 방지)
  const m = labeled ?? text.match(/(\d{1,2})\s*년\s*(\d{1,2})\s*개월/);
  if (!m) return undefined;
  const years = parseInt(m[1], 10);
  const months = m[2] ? parseInt(m[2], 10) : 0;
  if (isNaN(years)) return undefined;
  return years * 12 + months;
};

// 휴대폰/유선 전화 → 하이픈 표준형. 전화번호로 보기 어려우면 undefined.
export const normalizePhone = (raw?: string): string | undefined => {
  const s = clean(raw);
  if (!s) return undefined;
  let d = s.replace(/\D/g, "");
  if (d.startsWith("82")) d = "0" + d.slice(2); // 국제표기 +82 → 0
  if (d.length < 9 || d.length > 12) return undefined; // 전화번호 자릿수 범위 밖
  if (d.length === 12) return `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8)}`; // 0505/0507 안심번호
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10)
    return d.startsWith("02")
      ? `02-${d.slice(2, 6)}-${d.slice(6)}`
      : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  // 9자리: 서울(02) 국번 3자리만 처리, 그 외는 신뢰도 낮아 제외
  return d.startsWith("02") ? `02-${d.slice(2, 5)}-${d.slice(5)}` : undefined;
};

// 성별 → "남" / "여". 그 외 표기/빈값은 undefined.
export const normalizeGender = (raw?: string): string | undefined => {
  const s = clean(raw);
  if (!s) return undefined;
  if (/^(남(자|성)?|男|m|male)$/i.test(s)) return "남";
  if (/^(여(자|성)?|女|f|female)$/i.test(s)) return "여";
  return undefined;
};

// 생년월일 → YYYY-MM-DD / YYYY-MM / YYYY. placeholder(XX·??·00·MM)·한글은 제거.
export const normalizeBirthDate = (raw?: string): string | undefined => {
  const s = clean(raw);
  if (!s) return undefined;

  // 1) 4자리 연도(1900~2099)가 있으면 그 뒤에서 유효한 월/일만 덧붙인다.
  const year = s.match(/(?:19|20)\d{2}/)?.[0];
  if (year) {
    const rest = s.slice(s.indexOf(year) + 4);
    const nums = rest.match(/\d{1,2}/g) ?? [];
    const m = nums[0] && +nums[0] >= 1 && +nums[0] <= 12 ? nums[0].padStart(2, "0") : null;
    const d = m && nums[1] && +nums[1] >= 1 && +nums[1] <= 31 ? nums[1].padStart(2, "0") : null;
    return [year, m, d].filter(Boolean).join("-");
  }

  // 2) 연도 표기가 없는 6자리(YYMMDD, 주민번호 앞부분) → 30 이상은 19xx, 미만은 20xx.
  const six = s.replace(/\D/g, "");
  if (six.length === 6) {
    const yy = +six.slice(0, 2);
    const mo = +six.slice(2, 4);
    const da = +six.slice(4, 6);
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      const fullYear = yy >= 30 ? 1900 + yy : 2000 + yy;
      return `${fullYear}-${six.slice(2, 4)}-${six.slice(4, 6)}`;
    }
  }
  return undefined;
};

// 기술등급 → 초급/중급/고급/특급. "~급" 형태(중상급 등)는 보존, 숫자 포함 잡값은 제거.
const GRADE_CANON = ["초급", "중급", "고급", "특급"];
export const normalizeSkillGrade = (raw?: string): string | undefined => {
  const s = clean(raw);
  if (!s) return undefined;
  if (GRADE_CANON.includes(s)) return s;
  if (/\d/.test(s)) return undefined; // "코사 12년" 같은 경력 문구
  if (s.length <= 4 && s.endsWith("급")) return s; // "중상급" 등 등급 변형 보존
  return undefined;
};

// 주소 → 시/도(광역) 추출. 첫 토큰(시도 접두어)에 앵커 매칭해 "경기 광주시 ↔ 광주광역시" 혼동 방지.
const REGIONS: Array<[string, RegExp]> = [
  ["서울", /^서울/], ["부산", /^부산/], ["대구", /^대구/], ["인천", /^인천/],
  ["광주", /^광주/], ["대전", /^대전/], ["울산", /^울산/], ["세종", /^세종/],
  ["경기", /^경기/], ["강원", /^강원/], ["충북", /^(충북|충청북)/], ["충남", /^(충남|충청남)/],
  ["전북", /^(전북|전라북)/], ["전남", /^(전남|전라남)/], ["경북", /^(경북|경상북)/],
  ["경남", /^(경남|경상남)/], ["제주", /^제주/],
];
export const extractRegion = (address?: string): string | undefined => {
  const s = clean(address);
  if (!s) return undefined;
  const first = s.split(/\s/)[0];
  for (const [canon, re] of REGIONS) if (re.test(first)) return canon;
  return undefined;
};

export interface ParsedSalary {
  amount?: number; // 만원 단위
  period?: string; // "연" | "월"
  negotiable?: boolean;
}
// 희망급여 자유문구 → { 금액(만원), 기간, 협의여부 }.
// 예: "단가 월 550" → {550,"월"}, "연봉 3,500만원" → {3500,"연"}, "면접 후 결정" → {negotiable:true}
export const parseSalary = (raw?: string): ParsedSalary => {
  const s = clean(raw);
  if (!s) return {};
  const negotiable = /협의|면접|추후|별도|결정|상담/.test(s) || undefined;
  const period = /월|단가/.test(s) ? "월" : /연봉|연|年/.test(s) ? "연" : undefined;
  let amount: number | undefined;
  const m = s.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(억|천만|천|만)?/);
  if (m) {
    const n = parseFloat(m[1]);
    const unit = m[2];
    amount = unit === "억" ? n * 10000 : unit === "천만" || unit === "천" ? n * 1000 : Math.round(n);
  }
  return { amount, period, negotiable };
};

// 프로필 이미지 URL → http(s) 아니거나 placeholder(flaticon)면 제거.
export const normalizeImageUrl = (raw?: string): string | undefined => {
  const s = clean(raw);
  if (!s) return undefined;
  if (!/^https?:\/\//i.test(s)) return undefined;
  if (s.toLowerCase().includes("flaticon.com")) return undefined;
  return s;
};

// 경력 1건 정규화 (문자열 trim + tech_stack/key_achievements 정리).
const cleanWorkExperience = (w: ResumeWorkExperience): ResumeWorkExperience => ({
  ...w,
  start_date: clean(w.start_date),
  end_date: clean(w.end_date),
  company_name: clean(w.company_name),
  department: clean(w.department),
  job_title: clean(w.job_title),
  responsibilities: clean(w.responsibilities),
  tech_stack: cleanStringArray(w.tech_stack),
  key_achievements: cleanStringArray(w.key_achievements),
});

// 프로젝트 1건 정규화.
const cleanProject = (p: ResumeProject): ResumeProject => ({
  ...p,
  start_date: clean(p.start_date),
  end_date: clean(p.end_date),
  project_name: clean(p.project_name),
  client_company: clean(p.client_company),
  role_and_tasks: clean(p.role_and_tasks),
  tech_stack: cleanStringArray(p.tech_stack),
  outcomes: clean(p.outcomes),
  scale: clean(p.scale),
});

// 의미 있는 내용이 하나도 없는(전부 빈) 경력/프로젝트 항목인지.
const isEmptyWork = (w: ResumeWorkExperience): boolean =>
  !w.company_name && !w.job_title && !w.department && !w.responsibilities &&
  !w.start_date && (w.tech_stack?.length ?? 0) === 0;
const isEmptyProject = (p: ResumeProject): boolean =>
  !p.project_name && !p.role_and_tasks && !p.outcomes && !p.start_date;

// skills: 객체/문자열 혼용. 이름이 비면 제거하고 이름 기준 중복 제거.
const cleanSkills = (arr?: ResumeSkillItem[]): ResumeSkillItem[] => {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: ResumeSkillItem[] = [];
  for (const item of arr) {
    const name = (typeof item === "string" ? item : item?.skill_name ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(
      typeof item === "string"
        ? name
        : { ...item, skill_name: name, proficiency_level: clean(item.proficiency_level), notes: clean(item.notes) },
    );
  }
  return out;
};

const cleanCertifications = (arr?: ResumeCertificationItem[]): ResumeCertificationItem[] => {
  if (!Array.isArray(arr)) return [];
  return arr.filter((c) => (typeof c === "string" ? c.trim() : (c?.certification_name ?? "").trim()));
};

const cleanLanguages = (arr?: ResumeLanguage[]): ResumeLanguage[] =>
  Array.isArray(arr) ? arr.filter((l) => clean(l?.language) || clean(l?.test_name)) : [];

const cleanAwards = (arr?: ResumeAward[]): ResumeAward[] =>
  Array.isArray(arr) ? arr.filter((a) => clean(a?.award_name) || clean(a?.competition_name)) : [];

/**
 * 파싱 결과 전체를 저장용으로 정규화한다.
 * - 스칼라: 표준화 + 빈값/placeholder 는 undefined 로 비움
 * - 배열: 공백/중복/빈 항목 제거
 * educations 는 프롬프트가 최소 1건(고졸 fallback)을 보장하므로 빈 항목을 강제로 지우지 않는다.
 */
export const normalizeResumeData = (rd: ResumeData): ResumeData => {
  const pi = rd.personal_info ?? {};
  const ps = rd.professional_summary ?? {};

  const expRaw = ps.total_experience_months;
  const totalMonths =
    typeof expRaw === "number" && isFinite(expRaw)
      ? Math.min(Math.max(Math.round(expRaw), 0), 720) // 0~60년으로 클램프
      : undefined;

  const address = clean(pi.address);
  const salary = parseSalary(ps.desired_salary);

  return {
    ...rd,
    personal_info: {
      ...pi,
      name: cleanName(pi.name),
      email: clean(pi.email)?.toLowerCase(),
      phone: normalizePhone(pi.phone),
      birth_date: normalizeBirthDate(pi.birth_date),
      gender: normalizeGender(pi.gender),
      address,
      region: extractRegion(address),
      profile_image_url: normalizeImageUrl(pi.profile_image_url),
      desired_position: clean(pi.desired_position),
    },
    professional_summary: {
      ...ps,
      job_category: clean(ps.job_category),
      current_role: clean(ps.current_role),
      total_experience_months: totalMonths,
      skill_grade: normalizeSkillGrade(ps.skill_grade),
      major_achievement: clean(ps.major_achievement),
      core_competencies: cleanStringArray(ps.core_competencies),
      introduction: clean(ps.introduction),
      desired_position: clean(ps.desired_position),
      desired_salary: clean(ps.desired_salary),
      desired_salary_amount: salary.amount,
      desired_salary_period: salary.period,
      desired_salary_negotiable: salary.negotiable,
    },
    file_grade: clean(rd.file_grade),
    evaluation: { one_line_review: clean(rd.evaluation?.one_line_review) },
    skills: cleanSkills(rd.skills),
    work_experiences: Array.isArray(rd.work_experiences)
      ? rd.work_experiences.map(cleanWorkExperience).filter((w) => !isEmptyWork(w))
      : [],
    projects: Array.isArray(rd.projects)
      ? rd.projects.map(cleanProject).filter((p) => !isEmptyProject(p))
      : [],
    certifications: cleanCertifications(rd.certifications),
    languages: cleanLanguages(rd.languages),
    awards: cleanAwards(rd.awards),
  };
};
