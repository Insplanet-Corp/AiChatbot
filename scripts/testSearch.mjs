#!/usr/bin/env node
/**
 * 인력 검색 파이프라인 진단 스크립트 (Node 전용)
 *
 * src/services/chatService.ts 의 postChat → postChatWithSupabase 흐름을 실제
 * 백엔드(Supabase + Ollama)에 그대로 재현해서, 검색 결과가 어느 단계에서
 * 0건이 되는지 단계별로 콘솔에 출력한다.
 *
 * 사용법:
 *   node scripts/testSearch.mjs
 *   node scripts/testSearch.mjs --query "React 경험이 있는 퍼블리셔를 찾아주세요."
 *   node scripts/testSearch.mjs --full     # 후보별 분류 근거/유사도까지 출력
 *
 * 주의: 복호화 과정에서 실제 PII(이름 등)가 출력될 수 있으니 로컬에서만 사용할 것.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// ── 환경변수 ──────────────────────────────────────────────────────────────────
const OLLAMA_URL = process.env.VITE_OLLAMA_URL;
const TEXT_MODEL = process.env.VITE_LLAMA_TEXT_MODEL;
const EMBED_MODEL = process.env.VITE_LLAMA_EMBEDDING_MODEL;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const missing = [
  ["VITE_OLLAMA_URL", OLLAMA_URL],
  ["VITE_LLAMA_TEXT_MODEL", TEXT_MODEL],
  ["VITE_LLAMA_EMBEDDING_MODEL", EMBED_MODEL],
  ["VITE_SUPABASE_URL", SUPABASE_URL],
  ["VITE_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY],
].filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`❌ .env 에 다음 값이 없습니다: ${missing.join(", ")}`);
  process.exit(1);
}

// ── CLI 인수 ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (n) => { const i = args.indexOf(n); return i !== -1 ? args[i + 1] : undefined; };
const QUERY = getArg("--query") ?? "금융권 경험이 있는 기획자를 찾아주세요.";
const FULL = args.includes("--full");

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Ollama 호출 (src/apis/ollama.ts 와 동일) ─────────────────────────────────
const getEmbedding = async (text) => {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text, keep_alive: -1 }),
  });
  if (!res.ok) throw new Error(`Ollama Embedding Error: ${res.status} - ${await res.text()}`);
  const result = await res.json();
  return result.embedding;
};

// app 의 askOllama 는 format 을 options 안에 넣는다(=Ollama 최상위 format 미적용).
// src/apis/ollama.ts LLM_JSON_OPTIONS 와 동일하게 재현(저온도 + JSON 강제).
const LLM_JSON_OPTIONS = {
  temperature: 0.1,
  stop: ["<|endoftext|>", "<|im_start|>", "<|im_end|>", "Question:"],
  format: "json",
};
const askOllama = async (messages) => {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: TEXT_MODEL, messages, stream: false, options: LLM_JSON_OPTIONS, keep_alive: -1 }),
  });
  if (!res.ok) throw new Error(`Ollama Error: ${res.status} - ${await res.text()}`);
  const result = await res.json();
  return result.message.content;
};

// ── 의도 + 필터 통합 추출 ──────────────────────────────────────────────────────
//   src/constants/chatPrompt.ts SEARCH_FILTER_MESSAGES
//   + src/services/chatService.ts extractSearchFilters 와 동일 (수정 시 함께 변경).
const JOB_CATEGORIES = ["기획", "디자인", "퍼블리싱", "개발"];
const VALID_GRADES = ["초급", "중급", "고급"];

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

const SEARCH_FILTER_MESSAGES = (message) => [
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

// LLM 출력 정규화 (환각/오타 → null)
const coerceCategory = (v) => (typeof v === "string" && JOB_CATEGORIES.includes(v) ? v : null);
const coerceGrade = (v) => (typeof v === "string" && VALID_GRADES.includes(v) ? v : null);
const coerceAge = (v) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n >= 10 && n <= 100 ? Math.trunc(n) : null;
};
const coerceExperienceYears = (v) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 60 ? Math.trunc(n) : null;
};

// 정규식 폴백 (LLM 호출/파싱 실패 시 결정적 키워드 필터 유지)
const fallbackCategory = (message) => {
  const m = message.toLowerCase();
  if (/디자이너|디자인|designer/.test(m)) return "디자인";
  if (/퍼블리|publish/.test(m)) return "퍼블리싱";
  if (/기획|pm|po/.test(m)) return "기획";
  if (/개발|프론트|백엔드|풀스택|developer|engineer|frontend|backend/.test(m)) return "개발";
  return null;
};
const fallbackGrade = (message) => {
  const m = message.toLowerCase();
  if (/초급|주니어|junior/.test(m)) return "초급";
  if (/중급|intermediate/.test(m)) return "중급";
  if (/고급|시니어|senior/.test(m)) return "고급";
  return null;
};
const fallbackAge = (message) => {
  const max = message.match(/(\d{1,2})\s*(?:세|살)\s*(?:이하|미만|까지)/);
  const min = message.match(/(\d{1,2})\s*(?:세|살)\s*(?:이상|초과|넘)/);
  return { maxAge: max ? parseInt(max[1], 10) : null, minAge: min ? parseInt(min[1], 10) : null };
};
const fallbackExperience = (message) => {
  const min = message.match(/(\d{1,2})\s*년\s*(?:차)?\s*(?:이상|초과|넘)/);
  const max = message.match(/(\d{1,2})\s*년\s*(?:차)?\s*(?:이하|미만|까지)/);
  return {
    minExperienceYears: min ? parseInt(min[1], 10) : null,
    maxExperienceYears: max ? parseInt(max[1], 10) : null,
  };
};
const fallbackFilters = (message) => {
  const grade = fallbackGrade(message);
  const category = fallbackCategory(message);
  const { maxAge, minAge } = fallbackAge(message);
  const { minExperienceYears, maxExperienceYears } = fallbackExperience(message);
  const hasSignal = !!(
    grade || category || maxAge !== null || minAge !== null ||
    minExperienceYears !== null || maxExperienceYears !== null
  );
  return { intent: hasSignal ? "search" : "chat", category, grade, minExperienceYears, maxExperienceYears, maxAge, minAge };
};

// 라우터 LLM 한 번으로 의도+직무+등급+나이를 추출. 진단용으로 raw/폴백 여부도 반환.
const extractSearchFilters = async (message) => {
  try {
    const raw = await askOllama(SEARCH_FILTER_MESSAGES(message));
    const parsed = JSON.parse(raw);
    return {
      raw,
      usedFallback: false,
      filters: {
        intent: parsed.intent === "search" ? "search" : "chat",
        category: coerceCategory(parsed.category),
        grade: coerceGrade(parsed.grade),
        minExperienceYears: coerceExperienceYears(parsed.minExperienceYears),
        maxExperienceYears: coerceExperienceYears(parsed.maxExperienceYears),
        maxAge: coerceAge(parsed.maxAge),
        minAge: coerceAge(parsed.minAge),
      },
    };
  } catch (e) {
    return { raw: `(LLM 추출 실패: ${e.message})`, usedFallback: true, filters: fallbackFilters(message) };
  }
};
const GRADE_THRESHOLDS = { JUNIOR_MAX_MONTHS: 60, MID_MAX_MONTHS: 120, SENIOR_MIN_MONTHS: 120 };
const matchesGrade = (months, grade) => {
  if (grade === "초급") return months <= GRADE_THRESHOLDS.JUNIOR_MAX_MONTHS;
  if (grade === "중급") return months > GRADE_THRESHOLDS.JUNIOR_MAX_MONTHS && months <= GRADE_THRESHOLDS.MID_MAX_MONTHS;
  if (grade === "고급") return months >= GRADE_THRESHOLDS.SENIOR_MIN_MONTHS;
  return true;
};
// 나이(만 나이) 하드필터 — src/services/chatService.ts matchesAge 와 동일. 생년 없으면 제외.
const matchesAge = (birthDate, maxAge, minAge) => {
  if (maxAge === null && minAge === null) return true;
  const year = birthDate ? parseInt(String(birthDate).substring(0, 4), 10) : NaN;
  if (!Number.isFinite(year)) return false;
  const age = new Date().getFullYear() - year;
  if (maxAge !== null && age > maxAge) return false;
  if (minAge !== null && age < minAge) return false;
  return true;
};
// 경력 연차 하드필터 — src/services/chatService.ts matchesExperience 와 동일.
const matchesExperience = (months, minYears, maxYears) => {
  if (minYears === null && maxYears === null) return true;
  const years = months / 12;
  if (minYears !== null && years < minYears) return false;
  if (maxYears !== null && years > maxYears) return false;
  return true;
};

// ── row → ResumeData (세분화 컬럼에서 재조립, src/utils/resumeMapper.ts 와 동일 개념) ──
const rowToResumeData = (row) => ({
  personal_info: { desired_position: row.desired_position },
  professional_summary: {
    job_category: row.job_category,
    current_role: row.current_position,
    desired_position: row.desired_position,
    core_competencies: row.core_competencies ?? [],
  },
  work_experiences: row.work_experiences ?? [],
  projects: row.projects ?? [],
});

// ── 직무 분류 (src/services/candidateService.ts 와 동일) ──────────────────────
const CATEGORY_KEYWORDS = [
  { category: "퍼블리싱", keywords: ["퍼블리셔", "퍼블리싱", "publisher", "publishing"] },
  { category: "개발", keywords: ["개발자", "개발", "developer", "engineer", "엔지니어", "프론트엔드", "백엔드", "풀스택", "frontend", "backend", "fullstack", "프로그래머", "programmer"] },
  { category: "디자인", keywords: ["디자인", "디자이너", "designer", "그래픽", "graphic", "영상", "편집"] },
  { category: "기획", keywords: ["기획", "기획자", " pm", " po"] },
];
const classifyJobCategory = (rd, row) => {
  const texts = [
    row?.job_category,
    rd?.personal_info?.desired_position,
    rd?.professional_summary?.job_category,
    rd?.professional_summary?.current_role,
    rd?.professional_summary?.desired_position,
    ...(rd?.professional_summary?.core_competencies ?? []),
    ...(Array.isArray(rd?.work_experiences) ? rd.work_experiences.flatMap((w) => [w.job_title, w.department, w.responsibilities]) : []),
    ...(Array.isArray(rd?.projects) ? rd.projects.map((p) => p.role_and_tasks) : []),
  ].filter(Boolean).join(" ").toLowerCase();

  let best = null, bestCount = 0;
  const breakdown = {};
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    let count = 0;
    for (const kw of keywords) {
      const re = new RegExp(kw.trim().toLowerCase(), "g");
      count += (texts.match(re) ?? []).length;
    }
    breakdown[category] = count;
    if (count > bestCount) { bestCount = count; best = category; }
  }
  return { category: best, breakdown };
};

// ── 메인 파이프라인 ───────────────────────────────────────────────────────────
const line = (c = "─") => console.log(c.repeat(64));

const run = async () => {
  console.log("\n🔍 인력 검색 파이프라인 진단");
  line("═");
  console.log("쿼리      :", QUERY);
  console.log("Ollama    :", OLLAMA_URL);
  console.log("임베딩모델:", EMBED_MODEL, "/ 텍스트모델:", TEXT_MODEL);
  line("═");

  // 1. 의도 + 필터 통합 추출 (router LLM 단일 호출)
  console.log("\n[1] 의도 + 필터 통합 추출 (router LLM 단일 호출)");
  const { raw: routerRaw, usedFallback, filters } = await extractSearchFilters(QUERY);
  console.log("    원본 응답 :", routerRaw);
  if (usedFallback) console.log("    ⚠️ LLM 추출 실패 → 정규식 폴백 사용");
  const { intent, category: categoryFilter, grade: gradeFilter, minExperienceYears, maxExperienceYears, maxAge, minAge } = filters;
  console.log("    판정      :", intent, intent === "search" ? "✅" : "❌ (검색 안 함 → '사용자 검색만 부탁드립니다' 반환)");
  if (intent !== "search") {
    console.log("\n⛔ 여기서 멈춤: 의도가 search 가 아니라 벡터 검색을 시작조차 안 합니다.");
    console.log("   → 라우터 LLM 이 위 쿼리를 'chat' 으로 분류했거나 JSON 을 안 돌려준 게 원인입니다.\n");
    return;
  }

  // 2. 추출된 필터
  const hasAgeFilter = maxAge !== null || minAge !== null;
  const hasExperienceFilter = minExperienceYears !== null || maxExperienceYears !== null;
  const hasStructuredFilter = !!(gradeFilter || categoryFilter || hasAgeFilter || hasExperienceFilter);
  console.log("\n[2] 추출된 필터");
  console.log("    등급 :", gradeFilter ?? "없음", "/ 직무 :", categoryFilter ?? "없음", "/ 경력(년) :", hasExperienceFilter ? `${minExperienceYears ?? ""}~${maxExperienceYears ?? ""}` : "없음", "/ 나이 :", hasAgeFilter ? `${minAge ?? ""}~${maxAge ?? ""}` : "없음");

  // 3. 임베딩
  console.log("\n[3] 임베딩 생성");
  const queryVector = await getEmbedding(QUERY);
  console.log("    차원 :", Array.isArray(queryVector) ? queryVector.length : `❌ 비정상(${typeof queryVector})`);

  // 4. 벡터 검색 (match_resumes RPC)
  const matchThreshold = hasStructuredFilter ? 0.1 : 0.3;
  const matchCount = hasStructuredFilter ? 30 : 4;
  console.log(`\n[4] 벡터 검색 RPC match_resumes (threshold=${matchThreshold}, count=${matchCount})`);
  const { data: rawCandidates, error } = await supabase.rpc("match_resumes", {
    query_embedding: queryVector,
    match_threshold: matchThreshold,
    match_count: matchCount,
  });
  if (error) {
    console.log("    ❌ RPC 에러:", error.message);
    console.log("\n⛔ 여기서 멈춤: 벡터 검색 자체가 실패했습니다.\n");
    return;
  }
  console.log("    반환 건수 :", rawCandidates?.length ?? 0);
  if (!rawCandidates || rawCandidates.length === 0) {
    console.log("    반환 컬럼 : (행 없음)");
    console.log("\n⛔ 여기서 멈춤: 임계값을 넘는 후보가 0건입니다.");
    console.log("   → 등록된 이력서가 없거나, threshold 가 높거나, 임베딩 차원이 DB 와 안 맞을 수 있습니다.\n");
    return;
  }
  console.log("    반환 컬럼 :", Object.keys(rawCandidates[0]).join(", "));
  if (rawCandidates[0].similarity !== undefined) {
    console.log("    유사도 범위:", rawCandidates[rawCandidates.length - 1].similarity?.toFixed?.(3), "~", rawCandidates[0].similarity?.toFixed?.(3));
  }

  // 5. 등급 + 경력 + 나이 하드필터 (사실 기반 → 제외)
  const hardFiltered = rawCandidates.filter((c) =>
    (!gradeFilter || matchesGrade(c.total_experience_months ?? 0, gradeFilter)) &&
    matchesExperience(c.total_experience_months ?? 0, minExperienceYears, maxExperienceYears) &&
    matchesAge(c.birth_date, maxAge, minAge),
  );
  if (gradeFilter || hasExperienceFilter || hasAgeFilter) console.log(`\n[5] 등급/경력/나이 하드필터 후 : ${hardFiltered.length}건`);

  // 6. 직무 분류 (평문 컬럼 기반 — 복호화 불필요)
  console.log("\n[6] 후보 직무 분류");
  const dist = {};
  const classified = hardFiltered.map((row, i) => {
    const rd = rowToResumeData(row);
    const name = row.name ?? "이름?";
    const { category, breakdown } = classifyJobCategory(rd, row);
    const key = category ?? "미분류";
    dist[key] = (dist[key] ?? 0) + 1;
    if (FULL) {
      console.log(`    #${i + 1} ${name}  sim=${row.similarity?.toFixed?.(3) ?? "-"}  → ${key}  (키워드 카운트: ${JSON.stringify(breakdown)})`);
    }
    return { name, category, similarity: row.similarity };
  });
  console.log("    직무 분포        :", dist);

  // 7. 직무 우선순위 정렬 (현재 코드: soft preference + 보충)
  console.log("\n[7] 직무 우선순위 적용 (수정본: 일치 우선 + 벡터 순 보충)");
  let ordered = classified;
  if (categoryFilter) {
    const matched = classified.filter((c) => c.category === categoryFilter);
    const rest = classified.filter((c) => c.category !== categoryFilter);
    ordered = [...matched, ...rest];
    console.log(`    '${categoryFilter}' 정확 일치 : ${matched.length}건 / 전체 ${classified.length}건`);
    console.log(`    → 일치 0건이어도 보충으로 결과는 나옴 (수정 전이라면 여기서 0건 = 무응답)`);
  }
  const top = ordered.slice(0, 4);

  // 8. 최종
  console.log("\n[8] 최종 후보 (상위 4명, LLM 평가 대상)");
  top.forEach((c, i) => console.log(`    ${i + 1}. ${c.name}  [${c.category ?? "미분류"}]  sim=${c.similarity?.toFixed?.(3) ?? "-"}`));
  line("═");
  console.log(top.length > 0
    ? `✅ 결과 ${top.length}명 — 앱에서 카드가 떠야 정상입니다.`
    : "⛔ 최종 0명 — 무응답 재현됨.");
  console.log("");
};

run().catch((e) => {
  console.error("\n실행 오류:", e.message);
  console.error("(Ollama 서버가 떠 있는지, .env 의 URL/모델명이 맞는지 확인하세요)\n");
  process.exit(1);
});
