const OLLAMA_URL = import.meta.env.VITE_OLLAMA_URL;

// JSON 응답을 강제하는 LLM 호출의 공통 옵션.
// (낮은 temperature + 모델 종료 토큰 + JSON 포맷). 호출부에서 num_ctx 등을 덧붙여 사용한다.
export const LLM_JSON_OPTIONS = {
  temperature: 0.1,
  stop: ["<|endoftext|>", "<|im_start|>", "<|im_end|>", "Question:"],
  format: "json",
} as const;

const getEmbedding = async (text: string): Promise<number[]> => {
  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: import.meta.env.VITE_LLAMA_EMBEDDING_MODEL,
      prompt: text,
      keep_alive: -1, // 서버 GPU에 AI 모델 내리지 않도록 설정.
    }),
  });

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
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream, options, keep_alive: -1 }),
  });

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
