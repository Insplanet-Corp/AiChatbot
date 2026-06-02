import { supabase } from "../utils/supabase";
import { askOllama, getEmbedding } from "../apis/ollama";
import {
  CHAT_TYPE_MESSAGES,
  CHAT_WITH_SUPABASE_MESSAGES,
} from "../constants/chatPrompt";
import { mapRowToCardData, CandidateCardData } from "./candidateService";

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
  work_experiences: any[];
  projects: any[];
};

const postChat = async (params: PostChatParams): Promise<ChatResponse> => {
  try {
    const intentType = await postChatToType(params);
    if (intentType === "search") {
      return await postChatWithSupabase(params);
    }
    return { text: "사용자 검색만 부탁드립니다." };
  } catch (error) {
    console.error("postChat Error:", error);
    throw new Error("대화 처리 중 오류가 발생했습니다.");
  }
};

const postChatToType = async ({
  message,
}: PostChatParams): Promise<ChatIntent> => {
  try {
    const content = await askOllama(
      import.meta.env.VITE_LLAMA_TEXT_MODEL,
      CHAT_TYPE_MESSAGES(message),
      false,
      { format: "json" },
    );
    try {
      const parsedData = JSON.parse(content);
      return parsedData.type === "search" ? "search" : "chat";
    } catch {
      return "chat";
    }
  } catch (error) {
    console.error("라우터 통신 에러:", error);
    return "chat";
  }
};

// 후보자 1명을 LLM 으로 평가해 카드 + 사유(reason) 를 붙여 반환.
// 파싱/통신 오류가 나도 throw 하지 않고 안전한 fallback 카드를 돌려준다.
const evaluateCandidate = async (candidate: MinimalCandidate, message: string) => {
  const { work_experiences, projects, ...cardData } = candidate;

  try {
    const candidateForLLM = {
      introduction: candidate.introduction,
      skills: candidate.details.skills,
      work_experiences,
      projects,
    };

    const resultText = await askOllama(
      import.meta.env.VITE_LLAMA_TEXT_MODEL,
      CHAT_WITH_SUPABASE_MESSAGES(message, JSON.stringify(candidateForLLM)),
      true,
      {
        num_ctx: 8192,
        temperature: 0.1,
        stop: ["<|endoftext|>", "<|im_start|>", "<|im_end|>", "Question:"],
        format: "json",
      },
    );

    let parsed = JSON.parse(resultText);
    parsed = Array.isArray(parsed) ? parsed[0] : parsed;

    return {
      ...cardData,
      details: {
        ...cardData.details,
        major_experience: parsed.major_experience || "관련 경험 없음",
        skills: parsed.skills || cardData.details.skills,
      },
      reason: parsed.reason || "조건에 부합하는 인재입니다.",
    };
  } catch (err) {
    console.error(`[${candidate.name}] 평가 중 AI 파싱 오류 발생 :`, err);
    return {
      ...cardData,
      reason: "AI 분석 중 오류가 발생하여 사유를 생성하지 못했습니다.",
      details: {
        ...cardData.details,
        major_experience: "확인 불가",
      },
    };
  }
};

const postChatWithSupabase = async ({
  message,
}: PostChatParams): Promise<ChatResponse> => {
  try {
    const queryVector = await getEmbedding(message);
    const { data: matchedCandidates, error } = await supabase.rpc(
      "match_resumes",
      {
        query_embedding: queryVector,
        match_threshold: 0.4,
        match_count: 4,
      },
    );

    if (error) throw new Error(`Vector Search Error: ${error.message}`);
    if (!matchedCandidates || matchedCandidates.length === 0) {
      return { text: "검색 조건에 맞는 인재가 없습니다." };
    }

    const minimalCandidates: MinimalCandidate[] = matchedCandidates.map(
      (c: any) => ({
        ...mapRowToCardData(c),
        work_experiences: c.work_experiences || [],
        projects: c.projects || [],
      }),
    );

    // 후보자별 LLM 평가를 병렬 처리 (결과 순서는 입력 순서와 동일하게 유지됨)
    const evaluatedCandidates = await Promise.all(
      minimalCandidates.map((candidate) => evaluateCandidate(candidate, message)),
    );

    return { text: JSON.stringify(evaluatedCandidates) };
  } catch (error) {
    console.error("AI Vector Search error:", error);
    throw new Error("AI 처리 및 벡터 검색 중 오류가 발생했습니다.");
  }
};

export { postChat };
