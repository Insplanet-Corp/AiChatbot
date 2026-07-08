// 라우터 LLM 단일 호출로 "의도 + 직무/등급/나이 필터" 를 한 번에 구조화 추출한다.
// (기존 CHAT_TYPE_MESSAGES(의도만) + 정규식 키워드 추출기를 대체)
const SEARCH_FILTER_SYSTEM_PROMPT = `당신은 인재 검색 쿼리에서 "의도"와 "필터 조건"을 동시에 추출하는 라우터 AI입니다.
사용자 메시지를 분석해 아래 스키마의 JSON 객체로만 응답하세요. 설명·마크다운·코드펜스 금지.

[출력 스키마]
{
  "intent": "search" | "chat",
  "category": "기획" | "디자인" | "퍼블리싱" | "개발" | null,
  "grade": "초급" | "중급" | "고급" | null,
  "minExperienceYears": <정수> | null,
  "maxExperienceYears": <정수> | null,
  "maxAge": <정수> | null,
  "minAge": <정수> | null
}

[규칙]
1. intent: 사람(인재/지원자/후보/직무 보유자)을 찾으려는 요청이면 "search", 그 외(인사·날씨·잡담)는 "chat".
2. category: 아래 4개 중 하나로 정규화하고, 해당 없으면 null.
   - "기획": 기획자, PM, PO, 서비스기획, 전략기획
   - "디자인": 디자이너, UI/UX, 그래픽, 영상/편집 디자인
   - "퍼블리싱": 퍼블리셔, HTML/CSS, 마크업
   - "개발": 개발자, 프론트엔드, 백엔드, 풀스택, 모바일, 데이터, 엔지니어, 프로그래머
   ※ "디자이너"는 반드시 "디자인", "퍼블리셔"는 반드시 "퍼블리싱"으로 매핑한다.
3. grade: 경력 등급. "주니어"→"초급", "시니어"→"고급". 명시 없으면 null.
   (※ "3년차"처럼 연차만 있는 표현은 등급이 아니므로 null)
4. minExperienceYears / maxExperienceYears: 경력 연차(년 단위 정수) 조건.
   - "10년 이상", "10년 넘는", "10년차 이상", "경력 10년 이상" → minExperienceYears: 10
   - "3년 이하", "5년 미만", "5년까지" → maxExperienceYears: (각각 3 / 5 / 5)
   - "3년차", "경력 3년"처럼 이상/이하 범위가 없는 단순 연차는 추측하지 말고 둘 다 null.
   - 연차 언급이 없으면 둘 다 null.
5. maxAge / minAge: 만 나이 조건(정수). (경력 '년'과 혼동 금지 — '세/살'만 나이다.)
   - "40세 이하", "40살까지", "40세 미만" → maxAge: 40
   - "30세 이상", "30살 넘는" → minAge: 30
   - 나이 언급이 없으면 둘 다 null. "40대"처럼 범위가 모호하면 추측하지 말고 null.
6. 확실하지 않은 값은 절대 추측하지 말고 null 을 사용한다.`;

// Ollama structured output 스키마 — 라우터 응답의 "형태"를 모델 레벨에서 강제한다.
// (format:"json" 은 유효한 JSON 만 보장하고 키/타입은 보장하지 않음. 스키마를 주면
//  누락 키·오타 키·잘못된 타입이 원천 차단되어 파싱 후 coerce 실패가 줄어든다)
const SEARCH_FILTER_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["search", "chat"] },
    category: { type: ["string", "null"], enum: ["기획", "디자인", "퍼블리싱", "개발", null] },
    grade: { type: ["string", "null"], enum: ["초급", "중급", "고급", null] },
    minExperienceYears: { type: ["integer", "null"] },
    maxExperienceYears: { type: ["integer", "null"] },
    maxAge: { type: ["integer", "null"] },
    minAge: { type: ["integer", "null"] },
  },
  required: ["intent", "category", "grade", "minExperienceYears", "maxExperienceYears", "maxAge", "minAge"],
} as const;

const SEARCH_FILTER_MESSAGES = (message: string) => [
  { role: "system", content: SEARCH_FILTER_SYSTEM_PROMPT },
  { role: "user", content: "리액트 3년차 프론트엔드 개발자 찾아줘" },
  { role: "assistant", content: `{"intent":"search","category":"개발","grade":null,"minExperienceYears":null,"maxExperienceYears":null,"maxAge":null,"minAge":null}` },
  { role: "user", content: "10년 이상 기획자 찾아줘" },
  { role: "assistant", content: `{"intent":"search","category":"기획","grade":null,"minExperienceYears":10,"maxExperienceYears":null,"maxAge":null,"minAge":null}` },
  { role: "user", content: "경력 5년 이하 디자이너 추천해줘" },
  { role: "assistant", content: `{"intent":"search","category":"디자인","grade":null,"minExperienceYears":null,"maxExperienceYears":5,"maxAge":null,"minAge":null}` },
  { role: "user", content: "40세 이하 고급 퍼블리셔 있을까?" },
  { role: "assistant", content: `{"intent":"search","category":"퍼블리싱","grade":"고급","minExperienceYears":null,"maxExperienceYears":null,"maxAge":40,"minAge":null}` },
  { role: "user", content: "30살 이상 개발자 찾아줘" },
  { role: "assistant", content: `{"intent":"search","category":"개발","grade":null,"minExperienceYears":null,"maxExperienceYears":null,"maxAge":null,"minAge":30}` },
  { role: "user", content: "오늘 날씨 어때요?" },
  { role: "assistant", content: `{"intent":"chat","category":null,"grade":null,"minExperienceYears":null,"maxExperienceYears":null,"maxAge":null,"minAge":null}` },
  { role: "user", content: message },
];

// 후보자 여러 명을 한 번의 LLM 호출로 평가한다 (기존: 후보자당 1회씩 병렬 호출).
// id 로 입출력을 매칭해, 응답 배열의 순서가 요청 배열과 달라져도 안전하게 매핑할 수 있게 한다.
const CHAT_WITH_SUPABASE_SYSTEM_PROMPT = `
You are an expert HR Assistant. Your task is to evaluate MULTIPLE candidates based on the user's query and return a strict JSON array.

[CRITICAL RULES]
1. STRICT JSON ONLY. Output MUST be a valid JSON array. NO markdown blocks (e.g., \`\`\`json), NO conversational text. Just the raw JSON starting with '[' and ending with ']'.
2. ONE OBJECT PER CANDIDATE. The output array MUST contain exactly one object for every candidate in [Candidates], in the same order, each carrying its original "id".
3. NO EXTRA KEYS. Only output the four keys listed below per object.

[TASKS] (for EACH candidate independently)
1. id: Copy the candidate's "id" value unchanged — used to match this result back to the candidate.
2. reason: Write a concise, 1-sentence evaluation in Korean explaining why this candidate fits the [Query].
3. skills: Reorder the candidate's 'skills' array so the most relevant skills to the [Query] appear first. DO NOT change the actual skill names.
4. major_experience: Look at the candidate's 'projects' array. Find the ONE project most relevant to the [Query] and extract its name as a string.

[Output Format]
[
  { "id": 0, "major_experience": "String (most relevant project name)", "skills": ["Array of Strings (reordered by relevance)"], "reason": "String (1-sentence Korean evaluation)" },
  { "id": 1, "major_experience": "...", "skills": ["..."], "reason": "..." }
]
`;

const CHAT_WITH_SUPABASE_USER_PROMPT = (
  query: string,
  candidatesJson: string,
) => `
[Query]
"${query}"

[Candidates]
${candidatesJson}
`;

const CHAT_WITH_SUPABASE_MESSAGES = (query: string, candidatesJson: string) => [
  {
    role: "system",
    content: CHAT_WITH_SUPABASE_SYSTEM_PROMPT,
  },
  {
    role: "user",
    content: CHAT_WITH_SUPABASE_USER_PROMPT(query, candidatesJson),
  },
];

// 배치 평가 응답 스키마 — id 로 매칭되는 평가 객체 배열을 모델 레벨에서 강제.
const CANDIDATE_EVAL_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      id: { type: "integer" },
      major_experience: { type: "string" },
      skills: { type: "array", items: { type: "string" } },
      reason: { type: "string" },
    },
    required: ["id", "major_experience", "skills", "reason"],
  },
} as const;

export {
  SEARCH_FILTER_MESSAGES,
  SEARCH_FILTER_SCHEMA,
  CHAT_WITH_SUPABASE_MESSAGES,
  CANDIDATE_EVAL_SCHEMA,
};
