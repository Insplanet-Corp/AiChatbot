import { supabase } from "../utils/supabase";
import { encryptJSON } from "../utils/encrypt";
import { askOllama, getEmbedding, LLM_JSON_OPTIONS } from "../apis/ollama";
import { extractTextFromFile } from "../utils/fileParser";
import {
  RESUME_PARSER_MESSAGES,
  RESUME_PROJECTS_ONLY_MESSAGES,
  splitResumeIntoSections,
} from "../constants/resumePrompt";
import type { ResumeData, ResumeProject } from "../types/resume";

// 이력서 파싱 LLM 호출 공통 옵션 (긴 컨텍스트 + JSON 강제)
const RESUME_LLM_OPTIONS = {
  num_ctx: 16384,
  num_predict: 8192,
  ...LLM_JSON_OPTIONS,
};

// 배열을 매핑 후 구분자로 연결. 배열이 아니면 빈 문자열 반환.
const mapJoin = <T>(
  arr: T[] | undefined,
  fn: (item: T) => string,
  sep: string,
): string => (Array.isArray(arr) ? arr.map(fn).join(sep) : "");

/**
 * LLM 응답에서 JSON 부분만 추출.
 * 배열 응답([...])과 객체 응답({...}) 모두 처리.
 * 마크다운 펜스나 설명 텍스트는 첫/마지막 괄호 기준으로 자동 제거.
 */
const extractJsonText = (raw: string): string => {
  const objStart = raw.indexOf("{");
  const arrStart = raw.indexOf("[");

  const isArray = arrStart !== -1 && (objStart === -1 || arrStart < objStart);

  if (isArray) {
    const end = raw.lastIndexOf("]");
    if (arrStart === -1 || end === -1) throw new Error("JSON 배열을 찾을 수 없습니다.");
    return raw.substring(arrStart, end + 1);
  } else {
    const end = raw.lastIndexOf("}");
    if (objStart === -1 || end === -1) throw new Error("JSON 객체를 찾을 수 없습니다.");
    return raw.substring(objStart, end + 1);
  }
};

// 잘린 JSON을 복구: 열린 bracket/brace를 역순으로 닫아줌
const repairTruncatedJson = (raw: string): string => {
  const text = extractJsonText(raw);

  try {
    JSON.parse(text);
    return text;
  } catch {}

  const stack: string[] = [];
  const pairs: Record<string, string> = { "{": "}", "[": "]" };
  let inString = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prev = text[i - 1];
    if (inString) {
      if (ch === '"' && prev !== "\\") inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }

  const trimmed = text.trimEnd().replace(/,\s*$/, "");
  const closing = stack.reverse().map((c) => pairs[c]).join("");
  const repaired = trimmed + closing;

  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    throw new Error("JSON 복구에 실패했습니다.");
  }
};

// LLM이 출력한 "undefined" 문자열 값을 빈 문자열로 정리
const sanitizeUndefined = (obj: any): any => {
  if (Array.isArray(obj)) return obj.map(sanitizeUndefined);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, sanitizeUndefined(v)]),
    );
  }
  if (typeof obj === "string" && obj.trim().toLowerCase() === "undefined")
    return "";
  return obj;
};

// 프로젝트명 기준 중복 제거
const deduplicateProjects = (projects: ResumeProject[]): ResumeProject[] => {
  const seen = new Set<string>();
  return projects.filter((p) => {
    const key = (p.project_name || "").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// 프로젝트 청크 1개를 AI로 파싱
const parseProjectChunk = async (chunk: string): Promise<ResumeProject[]> => {
  const raw = await askOllama(
    import.meta.env.VITE_LLAMA_TEXT_MODEL,
    RESUME_PROJECTS_ONLY_MESSAGES(chunk),
    true,
    RESUME_LLM_OPTIONS,
  );

  try {
    const repaired = repairTruncatedJson(raw);
    const parsed = sanitizeUndefined(JSON.parse(repaired));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("[프로젝트 청크 파싱 실패 - 건너뜀]", e);
    return [];
  }
};

// 파싱 결과를 임베딩용 평문 텍스트로 조립 (직군/직무/기술/역량/프로젝트/경력)
const buildEmbeddingText = (parsedData: ResumeData): string => {
  const jobCategory = parsedData.professional_summary?.job_category || "직무미상";
  const currentRole = parsedData.professional_summary?.current_role || "";

  const skillString = mapJoin(
    parsedData.skills,
    (s) => (typeof s === "string" ? s : s.skill_name || ""),
    ", ",
  );

  const competencyString = mapJoin(
    parsedData.professional_summary?.core_competencies,
    (c) => c,
    " ",
  );

  const projectString = mapJoin(
    parsedData.projects,
    (p) => {
      const techStr = Array.isArray(p.tech_stack) ? p.tech_stack.join(", ") : "";
      const outcomeStr = p.outcomes || "";
      return [p.project_name, techStr, outcomeStr].filter(Boolean).join(" | ");
    },
    "\n",
  );

  const workTechString = mapJoin(
    parsedData.work_experiences,
    (w) => {
      const techStr = Array.isArray(w.tech_stack) ? w.tech_stack.join(", ") : "";
      const achieveStr = Array.isArray(w.key_achievements) ? w.key_achievements.join(". ") : "";
      return [w.company_name, w.job_title, techStr, achieveStr].filter(Boolean).join(" | ");
    },
    "\n",
  );

  return `직군: ${jobCategory}\n직무: ${currentRole}\n기술스택: ${skillString}\n핵심역량: ${competencyString}\n주요프로젝트:\n${projectString}\n경력상세:\n${workTechString}`.trim();
};

// 파일명에서 이름 추출 시 제거할 이력서 관련 키워드 (한글 토큰 오인 방지)
const FILENAME_STOPWORDS = [
  "경력기술서", "자기소개서", "재직증명서", "경력증명서",
  "포트폴리오", "지원서", "이력서", "자소서", "경력", "이력",
  "국문", "영문", "최종", "수정", "사본", "제출", "양식",
  "resume", "portfolio", "cv",
];

/**
 * 파일명에서 한글 이름을 추출. 찾지 못하면 null.
 * 확장자·이력서 키워드·숫자·특수문자를 제거한 뒤 남은 한글 2~5자 토큰을 이름으로 본다.
 * 예) "홍길동_이력서.pdf" → "홍길동", "[이력서]김철수_2024.docx" → "김철수"
 */
const extractNameFromFilename = (filename: string): string | null => {
  let base = filename.replace(/\.[^.]+$/, ""); // 확장자 제거
  for (const word of FILENAME_STOPWORDS) {
    base = base.replace(new RegExp(word, "gi"), " ");
  }
  const token = base
    .replace(/[^가-힣]+/g, " ") // 한글 외 문자는 구분자(공백)로 치환
    .trim()
    .split(/\s+/)
    .find((t) => t.length >= 2 && t.length <= 5);
  return token || null;
};

const parseAndSaveResume = async (file: File) => {
  try {
    const extractedText = await extractTextFromFile(file);
    if (!extractedText) throw new Error("파일에서 텍스트를 추출할 수 없습니다.");

    const { base: baseText, projectChunks } = splitResumeIntoSections(extractedText);

    // 1번 호출: 기본 정보 + 경력 + 학력 + 기술 전체 스키마
    const rawBase = await askOllama(
      import.meta.env.VITE_LLAMA_TEXT_MODEL,
      RESUME_PARSER_MESSAGES(projectChunks.length > 0 ? baseText : extractedText),
      true,
      RESUME_LLM_OPTIONS,
    );

    const repairedBase = repairTruncatedJson(rawBase);
    const parsedData: ResumeData = sanitizeUndefined(JSON.parse(repairedBase));

    if (Array.isArray(parsedData.abilities)) {
      parsedData.abilities = parsedData.abilities.map((item) =>
        typeof item === "string" ? { desc: item } : item,
      );
    }

    // 2~4번 호출: 프로젝트 청크별 병렬 파싱 후 중복 제거하여 병합
    if (projectChunks.length > 0) {
      const chunkResults = await Promise.all(
        projectChunks.map((chunk) => parseProjectChunk(chunk)),
      );
      parsedData.projects = deduplicateProjects(chunkResults.flat());
    }

    const jobCategory = parsedData.professional_summary?.job_category || "직무미상";
    const vector = await getEmbedding(buildEmbeddingText(parsedData));

    // 이름: 파싱 결과 우선, 비어 있으면 파일명에서 추출, 그래도 없으면 "이름없음"
    const parsedName = parsedData.personal_info?.name?.replace(/\s+/g, "");
    const nameFromFile = parsedName ? null : extractNameFromFilename(file.name);
    // 파일명으로 보강한 경우 resume_data 에도 반영 (UI 는 personal_info.name 을 표시)
    if (nameFromFile) {
      parsedData.personal_info = { ...parsedData.personal_info, name: nameFromFile };
    }

    const originalName = parsedName || nameFromFile || "이름없음";
    const encryptedParsedData = encryptJSON(parsedData);

    const { data, error } = await supabase
      .from("resumes")
      .insert([
        {
          name: originalName,
          job_category: jobCategory,
          total_experience_months: parsedData.professional_summary?.total_experience_months || 0,
          resume_data: encryptedParsedData,
          embedding: vector,
          rating: 0,
        },
      ])
      .select();

    if (error) throw new Error(error.message);
    return data;
  } catch (error) {
    console.error("이력서 처리 오류:", error);
    const reason = error instanceof Error ? error.message : "알 수 없는 오류";
    throw new Error(`이력서 분석 또는 저장에 실패했습니다: ${reason}`);
  }
};

export { parseAndSaveResume };
