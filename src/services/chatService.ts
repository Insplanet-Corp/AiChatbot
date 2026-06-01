import { supabase } from "../utils/supabase";
import { askOllama, getEmbedding } from "../apis/ollama";
import {
  CHAT_TYPE_MESSAGES,
  CHAT_WITH_SUPABASE_MESSAGES,
} from "../constants/chatPrompt";
import { askGemini } from "../apis/gemini";
import { mapRowToCardData } from "./candidateService";

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

const postChat = async (params: PostChatParams): Promise<ChatResponse> => {
  try {
    const intentType = await postChatToType(params);
    if (intentType === "search") {
      console.log("search");
      return await postChatWithSupabase(params);
    } else {
      console.log("chat");
      return { text: "사용자 검색만 부탁드립니다." };
    }
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
    console.log(content);
    try {
      const parsedData = JSON.parse(content);
      return parsedData.type === "search" ? "search" : "chat";
    } catch (error) {
      return "chat";
    }
  } catch (error) {
    console.error("라우터 통신 에러:", error);
    return "chat";
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

    console.log("matchedCandidates : ", matchedCandidates);

    const minimalCandidates = matchedCandidates.map((c: any) => {
      const card = mapRowToCardData(c);
      return {
        ...card,
        work_experiences: c.work_experiences || [],
        projects: c.projects || [],
      };
    });

    console.log("복호화 :", minimalCandidates);

    const evaluatedCandidates = [];
    for (const candidate of minimalCandidates) {
      try {
        console.log(`[${candidate.name}] AI 분석 시작...`);

        const candidateForLLM = {
          introduction: candidate.introduction,
          skills: candidate.details.skills,
          work_experiences: candidate.work_experiences,
          projects: candidate.projects,
        };

        const singleCandidateJson = JSON.stringify(candidateForLLM);

        console.log(singleCandidateJson);

        const resultText = await askOllama(
          import.meta.env.VITE_LLAMA_TEXT_MODEL,
          CHAT_WITH_SUPABASE_MESSAGES(message, singleCandidateJson),
          true,
          {
            num_ctx: 8192,
            temperature: 0.1,
            stop: ["<|endoftext|>", "<|im_start|>", "<|im_end|>", "Question:"],
            format: "json",
          },
        );

        console.log(`[${candidate.name}] AI 응답:`, resultText);

        let parsedData = JSON.parse(resultText);
        parsedData = Array.isArray(parsedData) ? parsedData[0] : parsedData;

        const { work_experiences: _we, projects: _p, ...cardData } = candidate;
        evaluatedCandidates.push({
          ...cardData,
          details: {
            ...cardData.details,
            major_experience: parsedData.major_experience || "관련 경험 없음",
            skills: parsedData.skills || cardData.details.skills,
          },
          reason: parsedData.reason || "조건에 부합하는 인재입니다.",
        });

        console.log(evaluatedCandidates);
      } catch (err) {
        console.error(`[${candidate.name}] 평가 중 AI 파싱 오류 발생 :`, err);

        const { work_experiences: _we2, projects: _p2, ...cardDataErr } = candidate;
        evaluatedCandidates.push({
          ...cardDataErr,
          reason: "AI 분석 중 오류가 발생하여 사유를 생성하지 못했습니다.",
          details: {
            ...cardDataErr.details,
            major_experience: "확인 불가",
          },
        });
      }
    }

    const finalResultString = JSON.stringify(evaluatedCandidates);
    console.log("최종 합쳐진 AI 평가 결과:", finalResultString);

    return { text: finalResultString };
  } catch (error) {
    console.error("AI Vector Search error:", error);
    throw new Error("AI 처리 및 벡터 검색 중 오류가 발생했습니다.");
  }
};

export { postChat };
