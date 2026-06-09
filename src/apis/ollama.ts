const OLLAMA_URL = import.meta.env.VITE_OLLAMA_URL;

// 모델이 응답하지 않을 때 무한 대기하지 않도록 요청별 타임아웃(ms).
// Ollama 모델이 VRAM 부족/고장 등으로 멈추면 여기서 끊고 에러로 처리해,
// 화면이 5분간 멈춘 채 "응답 없음" 으로 보이는 상황을 막는다. (필요 시 조정)
const EMBEDDING_TIMEOUT_MS = 30_000;
const CHAT_TIMEOUT_MS = 120_000;

// AbortSignal.timeout 으로 타임아웃을 걸고, 타임아웃 시 원인을 명확히 알려주는 fetch 래퍼.
const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<Response> => {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new Error(`${label} 타임아웃 (${timeoutMs / 1000}초 초과) — Ollama 모델 응답 없음`);
    }
    throw e;
  }
};

// JSON 응답을 강제하는 LLM 호출의 공통 옵션.
// (낮은 temperature + 모델 종료 토큰 + JSON 포맷). 호출부에서 num_ctx 등을 덧붙여 사용한다.
export const LLM_JSON_OPTIONS = {
  temperature: 0.1,
  stop: ["<|endoftext|>", "<|im_start|>", "<|im_end|>", "Question:"],
  format: "json",
} as const;

const getEmbedding = async (text: string): Promise<number[]> => {
  const response = await fetchWithTimeout(
    `${OLLAMA_URL}/api/embeddings`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: import.meta.env.VITE_LLAMA_EMBEDDING_MODEL,
        prompt: text,
        keep_alive: -1, // 서버 GPU에 AI 모델 내리지 않도록 설정.
      }),
    },
    EMBEDDING_TIMEOUT_MS,
    "Ollama 임베딩",
  );

  if (!response.ok)
    throw new Error(`Ollama Embedding Error: ${response.status}`);
  const result = await response.json();
  return result.embedding;
};

const askOllama = async (
  model: string,
  messages: any[],
  stream = true,
  options?: any,
): Promise<string> => {
  const response = await fetchWithTimeout(
    `${OLLAMA_URL}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream, options, keep_alive: -1 }),
    },
    CHAT_TIMEOUT_MS,
    `Ollama 채팅(${model})`,
  );

  if (!response.ok) throw new Error(`Ollama Error: ${response.status}`);

  if (!stream) {
    const result = await response.json();
    console.log(result);
    return result.message.content;
  }

  if (!response.body) throw new Error("응답 Body가 없습니다.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let rawResponse = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.trim() === "") continue;
      try {
        const parsedChunk = JSON.parse(line);
        if (parsedChunk.message?.content) {
          rawResponse += parsedChunk.message.content;
          // console.log(`[실시간]: ${parsedChunk.message?.content}`);
        }
      } catch (e) {
        console.error("청크 파싱 에러:", e);
      }
    }
  }
  return rawResponse;
};

export { getEmbedding, askOllama };
