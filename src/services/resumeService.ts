import { supabase } from "../utils/supabase";
import { encryptJSON } from "../utils/encrypt";
import { askOllama, getEmbedding } from "../apis/ollama";
import { extractTextFromFile } from "../utils/fileParser";
import {
  RESUME_PARSER_MESSAGES,
  RESUME_PROJECTS_ONLY_MESSAGES,
  splitResumeIntoSections,
} from "../constants/resumePrompt";

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
const deduplicateProjects = (projects: any[]): any[] => {
  const seen = new Set<string>();
  return projects.filter((p) => {
    const key = (p.project_name || "").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// 프로젝트 청크 1개를 AI로 파싱
const parseProjectChunk = async (chunk: string): Promise<any[]> => {
  const raw = await askOllama(
    import.meta.env.VITE_LLAMA_TEXT_MODEL,
    RESUME_PROJECTS_ONLY_MESSAGES(chunk),
    true,
    {
      num_ctx: 16384,
      num_predict: 8192,
      temperature: 0.1,
      stop: ["<|endoftext|>", "<|im_start|>", "<|im_end|>", "Question:"],
      format: "json",
    },
  );

  console.log("[프로젝트 청크 응답]", raw);
  try {
    const repaired = repairTruncatedJson(raw);
    const parsed = sanitizeUndefined(JSON.parse(repaired));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("[프로젝트 청크 파싱 실패 - 건너뜀]", e);
    return [];
  }
};

const parseAndSaveResume = async (file: File) => {
  try {
    const extractedText = await extractTextFromFile(file);
    console.log(extractedText);
    if (!extractedText) throw new Error("파일에서 텍스트를 추출할 수 없습니다.");

    const { base: baseText, projectChunks } = splitResumeIntoSections(extractedText);
    console.log(`[이력서 파싱] 기본섹션 + 프로젝트 청크 ${projectChunks.length}개로 분리`);

    // 1번 호출: 기본 정보 + 경력 + 학력 + 기술 전체 스키마
    const rawBase = await askOllama(
      import.meta.env.VITE_LLAMA_TEXT_MODEL,
      RESUME_PARSER_MESSAGES(projectChunks.length > 0 ? baseText : extractedText),
      true,
      {
        num_ctx: 16384,
        num_predict: 8192,
        temperature: 0.1,
        stop: ["<|endoftext|>", "<|im_start|>", "<|im_end|>", "Question:"],
        format: "json",
      },
    );

    console.log("[1번 호출 완료]", rawBase);

    const repairedBase = repairTruncatedJson(rawBase);
    let parsedData = sanitizeUndefined(JSON.parse(repairedBase));

    if (Array.isArray(parsedData.abilities)) {
      parsedData.abilities = parsedData.abilities.map((item: any) =>
        typeof item === "string" ? { desc: item } : item,
      );
    }

    // 2~4번 호출: 프로젝트 청크별 병렬 파싱
    if (projectChunks.length > 0) {
      console.log(`[프로젝트 파싱] ${projectChunks.length}개 청크 병렬 처리 시작`);

      const chunkResults = await Promise.all(
        projectChunks.map((chunk, i) => {
          console.log(`[${i + 2}번 호출] 프로젝트 청크 ${i + 1}/${projectChunks.length}`);
          return parseProjectChunk(chunk);
        }),
      );

      const allProjects = deduplicateProjects(chunkResults.flat());
      console.log(`[프로젝트 병합] 총 ${allProjects.length}개 프로젝트 추출`);
      parsedData.projects = allProjects;
    }

    console.log("[최종 파싱 결과]", parsedData);

    const jobCategory = parsedData.professional_summary?.job_category || "직무미상";
    const currentRole = parsedData.professional_summary?.current_role || "";

    const skillString = Array.isArray(parsedData.skills)
      ? parsedData.skills.map((s: any) => s.skill_name).join(", ")
      : "";

    const competencyString = Array.isArray(parsedData.professional_summary?.core_competencies)
      ? parsedData.professional_summary.core_competencies.join(" ")
      : "";

    const projectString = Array.isArray(parsedData.projects)
      ? parsedData.projects
          .map((p: any) => {
            const techStr = Array.isArray(p.tech_stack) ? p.tech_stack.join(", ") : "";
            const outcomeStr = p.outcomes || "";
            return [p.project_name, techStr, outcomeStr].filter(Boolean).join(" | ");
          })
          .join("\n")
      : "";

    const workTechString = Array.isArray(parsedData.work_experiences)
      ? parsedData.work_experiences
          .map((w: any) => {
            const techStr = Array.isArray(w.tech_stack) ? w.tech_stack.join(", ") : "";
            const achieveStr = Array.isArray(w.key_achievements) ? w.key_achievements.join(". ") : "";
            return [w.company_name, w.job_title, techStr, achieveStr].filter(Boolean).join(" | ");
          })
          .join("\n")
      : "";

    const textToEmbed =
      `직군: ${jobCategory}\n직무: ${currentRole}\n기술스택: ${skillString}\n핵심역량: ${competencyString}\n주요프로젝트:\n${projectString}\n경력상세:\n${workTechString}`.trim();
    const vector = await getEmbedding(textToEmbed);

    const originalName = parsedData.personal_info?.name?.replace(/\s+/g, "") || "이름없음";

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
    throw new Error("이력서 분석 또는 저장에 실패했습니다.");
  }
};

export { parseAndSaveResume };
