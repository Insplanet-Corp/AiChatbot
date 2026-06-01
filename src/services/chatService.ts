import { supabase } from "../utils/supabase";
import { decryptJSON } from "../utils/encrypt";
import { askOllama, getEmbedding } from "../apis/ollama";
import { formatExperience } from "../utils/formatters";
import {
  CHAT_TYPE_MESSAGES,
  CHAT_WITH_SUPABASE_MESSAGES,
} from "../constants/chatPrompt";
import { askGemini } from "../apis/gemini";

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
      let decryptedResumeData: any = {};
      try {
        if (typeof c.resume_data === "string") {
          decryptedResumeData = decryptJSON<any>(c.resume_data);
          console.log("string decryptedResumeData : ", decryptedResumeData);
        } else {
          decryptedResumeData = c.resume_data || {};
        }
      } catch (err) {
        decryptedResumeData = c.resume_data || {};
      }

      const rd = decryptedResumeData || {};

      const {
        personal_info = {},
        professional_summary = {},
        evaluation = {},
        educations = [],
        certifications = [],
        skills = [],
        work_experiences = [],
        projects = [],
      } = rd;

      const birthYearStr = rd?.personal_info?.birth_date?.substring(0, 4);
      const birthYear = birthYearStr ? parseInt(birthYearStr, 10) : null;

      let finalEdu = "학력 정보 없음";
      if (Array.isArray(educations) && educations.length > 0) {
        const edu = educations[0];
        finalEdu =
          `${edu.school_name || ""} ${edu.major || ""} ${edu.graduation_status || ""}`.trim();
      }
      const qualifications = Array.isArray(certifications)
        ? certifications.map((cert: any) => cert.certification_name)
        : [];

      const skillsArr = Array.isArray(skills)
        ? skills.map((s: any) => s.skill_name)
        : [];

      const profileImage =
        personal_info.profile_image_url ||
        "https://cdn-icons-png.flaticon.com/256/1077/1077114.png";
      const category =
        c.job_category || professional_summary.job_category || "미분류";
      const experienceTotal = formatExperience(
        c.total_experience_months ||
          professional_summary.total_experience_months,
      );
      const internalRating = c.rating || 0;
      const introduction =
        evaluation.one_line_review ||
        professional_summary.introduction ||
        "소개글이 없습니다.";

      return {
        id: c.id,
        name: c.name,
        profile_image: profileImage,
        is_kosa_verified: false,
        basic_info: {
          category: category,
          experience_total: experienceTotal,
          birth_year: birthYear,
        },
        details: {
          final_education: finalEdu,
          qualifications: qualifications,
          major_experience: "",
          skills: skillsArr,
          internal_rating: internalRating,
        },
        introduction: introduction,
        work_experiences: work_experiences,
        projects: projects,
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

        evaluatedCandidates.push({
          ...candidate,
          details: {
            ...candidate.details,
            major_experience: parsedData.major_experience || "관련 경험 없음",
            skills: parsedData.skills || candidate.details.skills,
          },
          reason: parsedData.reason || "조건에 부합하는 인재입니다.",
          work_experiences: undefined,
          projects: undefined,
        });

        console.log(evaluatedCandidates);
      } catch (err) {
        console.error(`[${candidate.name}] 평가 중 AI 파싱 오류 발생 :`, err);

        evaluatedCandidates.push({
          ...candidate,
          reason: "AI 분석 중 오류가 발생하여 사유를 생성하지 못했습니다.",
          details: {
            ...candidate.details,
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
