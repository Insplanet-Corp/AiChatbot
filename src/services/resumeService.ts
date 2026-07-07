import { supabase } from "../utils/supabase";
import { resumeDataToColumns } from "../utils/resumeMapper";
import { normalizeResumeData, extractExperienceMonths } from "../utils/resumeNormalize";
import { askOllama, getEmbedding, LLM_JSON_OPTIONS } from "../apis/ollama";
import { extractTextFromFile } from "../utils/fileParser";
import { RESUME_PARSER_MESSAGES, RESUME_PROJECTS_ONLY_MESSAGES } from "../constants/resumePrompt";
import type { ResumeData, ResumeProject } from "../types/resume";
import {
  splitResumeIntoSections,
  repairTruncatedJson,
  sanitizeUndefined,
  deduplicateProjects,
  buildEmbeddingText,
  extractNameFromFilename,
  extractGradeFromFilename,
  extractCategoryFromFilename,
  extractEmailFromText,
  extractPhoneFromText,
  stripExampleEntries,
  isInterviewDocument,
  EXAMPLE_NAMES,
} from "../shared/resumeParsingCore";

// 이력서 파싱 LLM 호출 공통 옵션 (긴 컨텍스트 + JSON 강제)
const RESUME_LLM_OPTIONS = {
  num_ctx: 16384,
  num_predict: 8192,
  ...LLM_JSON_OPTIONS,
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

const parseAndSaveResume = async (file: File) => {
  try {
    const extractedText = await extractTextFromFile(file);
    if (!extractedText) throw new Error("파일에서 텍스트를 추출할 수 없습니다.");

    // 이력서가 아닌 인터뷰 문서(인터뷰 질의서/전화 인터뷰 등)는 DB 저장에서 제외
    if (isInterviewDocument(file.name, extractedText)) {
      throw new Error("이력서가 아닌 인터뷰 문서(인터뷰 질의서/전화 인터뷰 등)로 판단되어 저장에서 제외했습니다.");
    }

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

    // few-shot 예시를 그대로 베껴온 프로젝트/경력/학력 항목 제거
    stripExampleEntries(parsedData);

    // 이름: 파싱 결과 우선. 단 비어 있거나 프롬프트 예시 이름(홍길동 등)을 베껴온 경우는
    // 무효로 보고 파일명에서 추출한다. (에이전시 파일명이 더 신뢰도 높음)
    const rawName = parsedData.personal_info?.name?.replace(/\s+/g, "");
    const parsedName = rawName && !EXAMPLE_NAMES.has(rawName) ? rawName : null;
    const nameFromFile = parsedName ? null : extractNameFromFilename(file.name);
    // 최종 이름: 유효 파싱값 → 파일명 → "" (정규화 후 "이름없음"으로 저장)
    parsedData.personal_info = {
      ...parsedData.personal_info,
      name: parsedName ?? nameFromFile ?? "",
    };

    // 이메일 누락 방지: 파싱값 우선, 없으면 원문 전체에서 정규식으로 보강한다.
    // 단 예시값(@example.com)을 베껴온 경우는 무시하고 원문에서 다시 찾는다.
    const parsedEmail = extractEmailFromText(parsedData.personal_info?.email ?? "");
    const cleanParsedEmail =
      parsedEmail && !/@example\.com$/i.test(parsedEmail) ? parsedEmail : null;
    const finalEmail = cleanParsedEmail ?? extractEmailFromText(extractedText);
    if (finalEmail) {
      parsedData.personal_info = { ...parsedData.personal_info, email: finalEmail };
    }

    // 전화 누락 방지: 파싱값 우선, 없으면 원문에서 정규식으로 보강한다(이메일과 대칭).
    // 단 예시 번호(010-1234-5678)를 베껴온 경우는 무시하고 원문에서 다시 찾는다.
    const parsedPhone = extractPhoneFromText(parsedData.personal_info?.phone ?? "");
    const cleanParsedPhone =
      parsedPhone && parsedPhone.replace(/\D/g, "") !== "01012345678" ? parsedPhone : null;
    const finalPhone = cleanParsedPhone ?? extractPhoneFromText(extractedText);
    if (finalPhone) {
      parsedData.personal_info = { ...parsedData.personal_info, phone: finalPhone };
    }

    const gradeFromFile = extractGradeFromFilename(file.name);
    if (gradeFromFile) {
      parsedData.file_grade = gradeFromFile;
    }

    // 직군: 파일명에 에이전시 직군 태그("(퍼블)…")가 있으면 LLM 분류보다 우선.
    const categoryFromFile = extractCategoryFromFilename(file.name);
    if (categoryFromFile) {
      parsedData.professional_summary = {
        ...parsedData.professional_summary,
        job_category: categoryFromFile,
      };
    }

    // 총경력: 원문에 "N년 M개월" 표기가 있으면 LLM 산술값보다 우선(결정적·정확).
    const expFromText = extractExperienceMonths(extractedText);
    if (expFromText != null) {
      parsedData.professional_summary = {
        ...parsedData.professional_summary,
        total_experience_months: expFromText,
      };
    }

    // 저장 직전 값 정규화: 필드 의미에 맞게 표준화하고(전화/성별/생년월일/등급 등),
    // 빈값·placeholder 는 비워 "없는 정보가 들어가지 않도록" 한다.
    const normalized = normalizeResumeData(parsedData);

    // 정규화 결과 기준으로 메타 컬럼/임베딩 도출
    const originalName = normalized.personal_info?.name || "이름없음";
    const jobCategory = normalized.professional_summary?.job_category || "직무미상";
    // 이력서 유효성: 이메일이 없으면 이력서가 아닐 가능성이 높다고 판단.
    // 저장은 그대로 진행하되, is_valid_resume = false 로 기록해 구분할 수 있게 한다.
    const isValidResume = !!normalized.personal_info?.email;
    const vector = await getEmbedding(buildEmbeddingText(normalized));

    const { data, error } = await supabase
      .from("resumes")
      .insert([
        {
          name: originalName,
          job_category: jobCategory,
          total_experience_months: normalized.professional_summary?.total_experience_months || 0,
          embedding: vector,
          rating: 0,
          is_valid_resume: isValidResume, // 이메일 존재 여부로 판단한 이력서 유효성
          ...resumeDataToColumns(normalized), // 평문 컬럼/JSONB 로 분해 저장 (암호화 없음)
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
