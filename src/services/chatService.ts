import { supabase } from "../utils/supabase";
import { askOllama, getEmbedding, LLM_JSON_OPTIONS } from "../apis/ollama";
import {
  SEARCH_FILTER_MESSAGES,
  SEARCH_FILTER_SCHEMA,
  CHAT_WITH_SUPABASE_MESSAGES,
  CANDIDATE_EVAL_SCHEMA,
} from "../constants/chatPrompt";
import { mapRowToCardData, CandidateCardData } from "./candidateService";
import { JOB_CATEGORIES, type JobCategory } from "../constants/service";
import type { ResumeRow, ResumeWorkExperience, ResumeProject } from "../types/resume";

export interface PostChatParams {
  id: string;
  message: string;
  roomId: string;
  isUser: boolean;
}

export interface ChatResponse {
  text: string;
}

type ChatIntent = "search" | "chat";

// 카드 데이터 + LLM 평가에 필요한 원본 경력/프로젝트
type MinimalCandidate = CandidateCardData & {
  work_experiences: ResumeWorkExperience[];
  projects: ResumeProject[];
};

const postChat = async (params: PostChatParams): Promise<ChatResponse> => {
  try {
    console.log("[검색] 1. 요청 수신 - 쿼리:", params.message);
    const filters = await extractSearchFilters(params.message);
    console.log("[검색] 2. 의도/필터:", filters);
    if (filters.intent !== "search") {
      console.log("[검색] → 검색 의도가 아니라 판단되어 안내 메시지 반환");
      return { text: "사용자 검색만 부탁드립니다." };
    }
    return await postChatWithSupabase(params, filters);
  } catch (error) {
    console.error("[검색] postChat Error:", error);
    return { text: "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." };
  }
};

// ---------------------------------------------------------------
// 의도 + 필터 통합 추출 (라우터 LLM 단일 structured-output 호출)
// 기존 postChatToType + extractGradeFilter + extractCategoryFilter 를 대체.
// 직무/등급/나이를 LLM 한 번으로 뽑아 "디자이너→디자인" 같은 동의어/변형까지 흡수한다.
// ---------------------------------------------------------------
interface SearchFilters {
  intent: ChatIntent;
  category: JobCategory | null;
  grade: GradeLabel | null;
  minExperienceYears: number | null;
  maxExperienceYears: number | null;
  maxAge: number | null;
  minAge: number | null;
}

const VALID_GRADES: readonly GradeLabel[] = ["초급", "중급", "고급"];

// LLM 이 돌려준 값이 허용 enum/범위를 벗어나면 null 로 정규화 (환각/오타 방지)
const coerceCategory = (v: unknown): JobCategory | null =>
  typeof v === "string" && (JOB_CATEGORIES as readonly string[]).includes(v)
    ? (v as JobCategory)
    : null;

const coerceGrade = (v: unknown): GradeLabel | null =>
  typeof v === "string" && VALID_GRADES.includes(v as GradeLabel)
    ? (v as GradeLabel)
    : null;

const coerceAge = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n >= 10 && n <= 100 ? Math.trunc(n) : null;
};

// 경력 연차(년). 0~60 범위만 허용. (총경력은 total_experience_months 로 비교)
const coerceExperienceYears = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 60 ? Math.trunc(n) : null;
};

// ── 정규식 1차 추출: 결정적 키워드는 정규식이 먼저 뽑는다 ──
// 정규식이 잡은 값은 LLM 결과보다 우선한다(환각 없음·결정적). LLM 은 정규식이 못 잡은
// 애매한 표현("웹퍼블 마크업 전문가", 영문 등)만 보완하고, LLM 호출/파싱이 실패해도
// 정규식 결과만으로 검색이 동작한다(임베딩 모델만 살아 있어도 키워드 검색 유지).
const regexCategory = (message: string): JobCategory | null => {
  const m = message.toLowerCase();
  if (/디자이너|디자인|designer/.test(m)) return "디자인";
  if (/퍼블리|publish/.test(m)) return "퍼블리싱";
  if (/기획|pm|po/.test(m)) return "기획";
  if (/개발|프론트|백엔드|풀스택|developer|engineer|frontend|backend/.test(m)) return "개발";
  return null;
};

const regexGrade = (message: string): GradeLabel | null => {
  const m = message.toLowerCase();
  if (/초급|주니어|junior/.test(m)) return "초급";
  if (/중급|intermediate/.test(m)) return "중급";
  if (/고급|시니어|senior/.test(m)) return "고급";
  return null;
};

const regexAge = (message: string): { maxAge: number | null; minAge: number | null } => {
  const max = message.match(/(\d{1,2})\s*(?:세|살)\s*(?:이하|미만|까지)/);
  const min = message.match(/(\d{1,2})\s*(?:세|살)\s*(?:이상|초과|넘)/);
  return {
    maxAge: max ? parseInt(max[1], 10) : null,
    minAge: min ? parseInt(min[1], 10) : null,
  };
};

// "N년 이상/이하" 형태의 경력 연차 조건. ('년차'만 있는 단순 연차는 범위가 아니므로 무시)
const regexExperience = (
  message: string,
): { minExperienceYears: number | null; maxExperienceYears: number | null } => {
  const min = message.match(/(\d{1,2})\s*년\s*(?:차)?\s*(?:이상|초과|넘)/);
  const max = message.match(/(\d{1,2})\s*년\s*(?:차)?\s*(?:이하|미만|까지)/);
  return {
    minExperienceYears: min ? parseInt(min[1], 10) : null,
    maxExperienceYears: max ? parseInt(max[1], 10) : null,
  };
};

const extractFiltersByRegex = (message: string): SearchFilters => {
  const grade = regexGrade(message);
  const category = regexCategory(message);
  const { maxAge, minAge } = regexAge(message);
  const { minExperienceYears, maxExperienceYears } = regexExperience(message);
  // 키워드 신호가 하나라도 잡히면 검색 의도로 확정. 신호가 없으면 'chat' 으로 두되,
  // LLM 이 살아 있으면 LLM 의 intent 판단("사람 구해요" 같은 무키워드 검색)으로 덮인다.
  const hasSignal = !!(
    grade ||
    category ||
    maxAge !== null ||
    minAge !== null ||
    minExperienceYears !== null ||
    maxExperienceYears !== null
  );
  return {
    intent: hasSignal ? "search" : "chat",
    category,
    grade,
    minExperienceYears,
    maxExperienceYears,
    maxAge,
    minAge,
  };
};

// 정규식 1차 추출 → LLM 이 빈 필드만 보완하는 2단 구조.
// 정규식이 잡은 값은 결정적이므로 LLM 값으로 절대 덮어쓰지 않는다(환각 방지).
// LLM 호출/파싱이 실패하면 정규식 결과를 그대로 사용한다(기존 폴백 동작과 동일).
const extractSearchFilters = async (message: string): Promise<SearchFilters> => {
  const regex = extractFiltersByRegex(message);
  try {
    const content = await askOllama(
      import.meta.env.VITE_LLAMA_TEXT_MODEL,
      SEARCH_FILTER_MESSAGES(message),
      false,
      { ...LLM_JSON_OPTIONS, format: SEARCH_FILTER_SCHEMA }, // 스키마로 키/타입까지 강제
    );
    console.log("[검색] 1-1. 라우터 LLM 원본 응답:", content);
    const parsed = JSON.parse(content);
    return {
      // 정규식 신호가 있으면 이미 search. 없을 때만 LLM 의 의도 판단을 따른다.
      intent: regex.intent === "search" || parsed.intent === "search" ? "search" : "chat",
      category: regex.category ?? coerceCategory(parsed.category),
      grade: regex.grade ?? coerceGrade(parsed.grade),
      minExperienceYears: regex.minExperienceYears ?? coerceExperienceYears(parsed.minExperienceYears),
      maxExperienceYears: regex.maxExperienceYears ?? coerceExperienceYears(parsed.maxExperienceYears),
      maxAge: regex.maxAge ?? coerceAge(parsed.maxAge),
      minAge: regex.minAge ?? coerceAge(parsed.minAge),
    };
  } catch (error) {
    console.warn("[검색] 1-2. 라우터 LLM 실패 → 정규식 추출 결과만 사용:", error);
    return regex;
  }
};

// 안전한 fallback 카드 (LLM 평가 실패 시 사용). evaluateCandidate 였을 때와 동일한 문구를 유지한다.
const fallbackEvaluatedCard = (candidate: MinimalCandidate) => {
  const { work_experiences: _w, projects: _p, ...cardData } = candidate;
  return {
    ...cardData,
    reason: "AI 분석 중 오류가 발생하여 사유를 생성하지 못했습니다.",
    details: { ...cardData.details, major_experience: "확인 불가" },
  };
};

// 후보자 여러 명을 LLM 1회 호출로 한꺼번에 평가해 카드 + 사유(reason)를 붙여 반환.
// (예전에는 후보자당 1회씩 최대 4회 병렬 호출했으나, 배치 1회 호출로 통합해 LLM 왕복 수를 줄였다.)
// id 로 요청/응답을 매칭하므로 응답 순서가 어긋나거나 일부 후보가 누락돼도 안전하게 매핑되고,
// 응답 전체 파싱이 실패하면 모든 후보에 안전한 fallback 카드를 반환한다(throw 하지 않음).
const evaluateCandidates = async (candidates: MinimalCandidate[], message: string) => {
  if (candidates.length === 0) return [];

  try {
    const candidatesForLLM = candidates.map((candidate, id) => ({
      id,
      introduction: candidate.introduction,
      skills: candidate.details.skills,
      work_experiences: candidate.work_experiences,
      projects: candidate.projects,
    }));

    const resultText = await askOllama(
      import.meta.env.VITE_LLAMA_TEXT_MODEL,
      CHAT_WITH_SUPABASE_MESSAGES(message, JSON.stringify(candidatesForLLM)),
      true,
      { num_ctx: 16384, ...LLM_JSON_OPTIONS, format: CANDIDATE_EVAL_SCHEMA }, // 스키마로 배열 형태 강제
    );

    const cleanedText = resultText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(cleanedText);
    const resultsById = new Map<number, any>(
      (Array.isArray(parsed) ? parsed : [parsed]).map((r) => [r?.id, r]),
    );

    return candidates.map((candidate, id) => {
      const { work_experiences: _w, projects: _p, ...cardData } = candidate;
      const result = resultsById.get(id);
      if (!result) {
        console.warn(`[${candidate.name}] 배치 평가 응답에 결과가 없어 fallback 사용`);
        return fallbackEvaluatedCard(candidate);
      }
      return {
        ...cardData,
        details: {
          ...cardData.details,
          major_experience: result.major_experience || "관련 경험 없음",
          skills: result.skills || cardData.details.skills,
        },
        reason: result.reason || "조건에 부합하는 인재입니다.",
      };
    });
  } catch (err) {
    console.error("[검색] 후보자 배치 평가 중 AI 파싱 오류 발생:", err);
    return candidates.map(fallbackEvaluatedCard);
  }
};

// 기술 등급 경력 기준 (개월 수)
const GRADE_THRESHOLDS = {
  JUNIOR_MAX_MONTHS: 60,   // 초급: 5년 이하
  MID_MAX_MONTHS: 120,     // 중급: 10년 이하
  SENIOR_MIN_MONTHS: 120,  // 고급: 10년 이상
} as const;

type GradeLabel = "초급" | "중급" | "고급";

const matchesGrade = (months: number, grade: GradeLabel): boolean => {
  switch (grade) {
    case "초급": return months <= GRADE_THRESHOLDS.JUNIOR_MAX_MONTHS;
    case "중급": return months > GRADE_THRESHOLDS.JUNIOR_MAX_MONTHS && months <= GRADE_THRESHOLDS.MID_MAX_MONTHS;
    case "고급": return months >= GRADE_THRESHOLDS.SENIOR_MIN_MONTHS;
  }
};

// 나이(만 나이) 하드 필터. birth_date("YYYY...")로 출생연도를 구해 만 나이를 추정한다.
// candidateService.parseBirthYear 와 동일하게 '연 나이(현재연도-출생연도)'로 근사한다
// (생년월일에 월/일이 없거나 부정확한 경우가 많아 연 단위로 비교).
// 생년이 없거나 파싱 불가하면 명시적 나이 조건을 검증할 수 없으므로 제외(false)한다.
const matchesAge = (
  birthDate: string | undefined,
  maxAge: number | null,
  minAge: number | null,
): boolean => {
  if (maxAge === null && minAge === null) return true;
  const year = birthDate ? parseInt(birthDate.substring(0, 4), 10) : NaN;
  if (!Number.isFinite(year)) return false;
  const age = new Date().getFullYear() - year;
  if (maxAge !== null && age > maxAge) return false;
  if (minAge !== null && age < minAge) return false;
  return true;
};

// 경력 연차 하드 필터. total_experience_months(사실 기반 평문 컬럼)을 연 단위로 환산해 비교한다.
// "10년 이상" → minYears=10 → 120개월 이상만 통과. 생년/등급과 동일하게 신뢰도가 높아 '제외'로 적용.
const matchesExperience = (
  months: number,
  minYears: number | null,
  maxYears: number | null,
): boolean => {
  if (minYears === null && maxYears === null) return true;
  const years = months / 12;
  if (minYears !== null && years < minYears) return false;
  if (maxYears !== null && years > maxYears) return false;
  return true;
};

const postChatWithSupabase = async (
  { message }: PostChatParams,
  filters: SearchFilters,
): Promise<ChatResponse> => {
  try {
    const {
      category: categoryFilter,
      grade: gradeFilter,
      minExperienceYears,
      maxExperienceYears,
      maxAge,
      minAge,
    } = filters;
    const hasAgeFilter = maxAge !== null || minAge !== null;
    const hasExperienceFilter = minExperienceYears !== null || maxExperienceYears !== null;
    const hasStructuredFilter = !!(gradeFilter || categoryFilter || hasAgeFilter || hasExperienceFilter);
    console.log(
      "[검색] 3. 필터 - 등급:", gradeFilter ?? "없음",
      "/ 직무:", categoryFilter ?? "없음",
      "/ 경력(년):", hasExperienceFilter ? `${minExperienceYears ?? ""}~${maxExperienceYears ?? ""}` : "없음",
      "/ 나이:", hasAgeFilter ? `${minAge ?? ""}~${maxAge ?? ""}` : "없음",
    );

    const queryVector = await getEmbedding(message);
    console.log("[검색] 4. 임베딩 생성 완료 - 차원:", Array.isArray(queryVector) ? queryVector.length : typeof queryVector);

    const matchThreshold = hasStructuredFilter ? 0.1 : 0.3;
    const matchCount = hasStructuredFilter ? 30 : 4;
    const { data: rawCandidates, error } = await supabase.rpc(
      "match_resumes",
      {
        query_embedding: queryVector,
        match_threshold: matchThreshold,
        match_count: matchCount,
      },
    );
    console.log(`[검색] 5. 벡터 검색 (threshold=${matchThreshold}, count=${matchCount}) → ${rawCandidates?.length ?? 0}건`);

    if (error) {
      console.error("[검색] Vector Search Error:", error.message);
      return {
        text: JSON.stringify({
          __type: "error",
          query: message,
          reason: "인력 데이터베이스 검색 중 문제가 발생했습니다.\n네트워크 연결을 확인하거나 잠시 후 다시 시도해주세요.",
        }),
      };
    }
    if (!rawCandidates || rawCandidates.length === 0) {
      return {
        text: JSON.stringify({
          __type: "no_results",
          query: message,
          reason: `"${message}" 조건에 맞는 인재를 찾지 못했습니다.\n\n가능한 원인:\n• 등록된 이력서가 없거나 조건이 너무 구체적일 수 있습니다\n• 다른 키워드나 직무명으로 다시 시도해보세요\n• 스킬명이나 경력 연수 조건을 조정해보세요`,
        }),
      };
    }

    // 등급(경력 개월수)·경력 연차·나이(생년)는 사실 기반이라 신뢰도가 높아 '제외(hard filter)'로 적용한다.
    // 평문 컬럼(total_experience_months, birth_date)으로 먼저 걸러 카드 매핑 비용을 줄인다.
    const hardFiltered: ResumeRow[] = rawCandidates.filter((c: ResumeRow) =>
      (!gradeFilter || matchesGrade(c.total_experience_months ?? 0, gradeFilter)) &&
      matchesExperience(c.total_experience_months ?? 0, minExperienceYears, maxExperienceYears) &&
      matchesAge(c.birth_date, maxAge, minAge),
    );

    // 카드 매핑
    const candidates: MinimalCandidate[] = hardFiltered.map((c: ResumeRow) => ({
      ...mapRowToCardData(c),
      work_experiences: c.work_experiences || [],
      projects: c.projects || [],
    }));
    if (gradeFilter || hasExperienceFilter || hasAgeFilter)
      console.log("[검색] 6. 등급/경력/나이 하드필터 후:", hardFiltered.length, "건");

    // 직무 카테고리는 이력서 텍스트 기반 추론이라 오분류 가능성이 있어 '제외' 가 아닌
    // '우선순위' 로 적용한다. 일치 후보를 앞세우되 4명에 못 미치면 벡터 유사도 순으로 보충해,
    // 카테고리 오분류로 결과가 0건이 되는 상황을 방지한다.
    const categoryMatched = categoryFilter
      ? candidates.filter((c) => c.basic_info.category === categoryFilter)
      : candidates;
    const ordered = categoryFilter
      ? [...categoryMatched, ...candidates.filter((c) => c.basic_info.category !== categoryFilter)]
      : candidates;

    if (categoryFilter) {
      const dist = candidates.reduce<Record<string, number>>((acc, c) => {
        const key = c.basic_info.category ?? "미분류";
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});
      console.log("[검색] 7. 후보 직무 분포:", dist);
      console.log(`[검색] 8. '${categoryFilter}' 일치 ${categoryMatched.length}건 / 전체 ${candidates.length}건 (부족분은 벡터 순으로 보충)`);
    }

    const topCandidates = ordered.slice(0, 4);
    console.log("[검색] 9. 최종 후보:", topCandidates.length, "명 → LLM 평가 시작");

    if (topCandidates.length === 0) {
      const filterDesc = [
        categoryFilter && `직무: ${categoryFilter}`,
        gradeFilter && `등급: ${gradeFilter}`,
        minExperienceYears !== null && `경력 ${minExperienceYears}년 이상`,
        maxExperienceYears !== null && `경력 ${maxExperienceYears}년 이하`,
        maxAge !== null && `${maxAge}세 이하`,
        minAge !== null && `${minAge}세 이상`,
      ].filter(Boolean).join(", ");
      return {
        text: JSON.stringify({
          __type: "no_results",
          query: message,
          reason: `${filterDesc} 조건에 맞는 인재를 찾지 못했습니다.\n\n가능한 원인:\n• 해당 조건의 이력서가 아직 등록되지 않았을 수 있습니다\n• 다른 등급이나 직무 카테고리로 다시 시도해보세요`,
        }),
      };
    }

    // 후보자 전체를 LLM 1회 호출로 배치 평가 (기존: 후보자당 1회씩 최대 4회 병렬 호출)
    const evaluatedCandidates = await evaluateCandidates(topCandidates, message);
    console.log("[검색] 10. LLM 평가 완료:", evaluatedCandidates.length, "명 → 카드 반환");

    return { text: JSON.stringify(evaluatedCandidates) };
  } catch (error) {
    console.error("[검색] AI Vector Search error:", error);
    return { text: "인력 검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." };
  }
};

export { postChat };
