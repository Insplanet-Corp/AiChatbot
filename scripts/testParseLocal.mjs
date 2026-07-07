#!/usr/bin/env node
/**
 * 로컬 이력서 파싱 품질 테스트 스크립트
 *
 * 사용법:
 *   node scripts/testParseLocal.mjs                     # test-resumes/ 폴더 전체
 *   node scripts/testParseLocal.mjs --file 파일명.pdf   # 특정 파일만
 *   node scripts/testParseLocal.mjs --no-save           # test-results/ 저장 안 함
 *   node scripts/testParseLocal.mjs --verbose           # raw LLM 응답도 출력
 *
 * 출력: test-results/TIMESTAMP_파일명.json  +  콘솔 품질 점수 요약
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import {
  reconstructPdfPageText,
  splitResumeIntoSections,
  repairTruncatedJson as repairJson,
  sanitizeUndefined,
  deduplicateProjects,
  stripExampleEntries,
} from "../src/shared/resumeParsingCore.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

// ── 환경변수 ──────────────────────────────────────────────────────────────────
const OLLAMA_URL = process.env.VITE_OLLAMA_URL;
const TEXT_MODEL = process.env.VITE_LLAMA_TEXT_MODEL;

if (!OLLAMA_URL || !TEXT_MODEL) {
  console.error("❌ .env에 VITE_OLLAMA_URL, VITE_LLAMA_TEXT_MODEL 이 필요합니다.");
  process.exit(1);
}

// ── CLI 인수 ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name) => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : undefined; };
const hasFlag = (name) => args.includes(name);

const specificFile = getArg("--file");
const noSave = hasFlag("--no-save");
const verbose = hasFlag("--verbose");

const RESUMES_DIR = path.join(ROOT, "test-resumes");
const RESULTS_DIR = path.join(ROOT, "test-results");

// ── PDF 텍스트 추출 ───────────────────────────────────────────────────────────
let pdfjsLoaded = false;
let getDocument, GlobalWorkerOptions;

const loadPdfjs = async () => {
  if (pdfjsLoaded) return;
  // v5에서 Node.js 환경은 반드시 legacy 빌드를 사용해야 함
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  getDocument = pdfjs.getDocument;
  GlobalWorkerOptions = pdfjs.GlobalWorkerOptions;
  const workerPath = path.join(ROOT, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
  GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  pdfjsLoaded = true;
};

// 이미지형(스캔) PDF 폴백 OCR (scripts/seedResumesToDB.mjs 동일 로직)
const extractPdfTextViaOcr = async (pdf) => {
  const { createCanvas } = await import("@napi-rs/canvas");
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("kor+eng");
  try {
    let ocrText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = createCanvas(viewport.width, viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const { data } = await worker.recognize(canvas.toBuffer("image/png"));
      ocrText += data.text + "\n";
    }
    return ocrText.trim();
  } finally {
    await worker.terminate();
  }
};

const extractPdfText = async (filePath) => {
  await loadPdfjs();
  const data = new Uint8Array(fs.readFileSync(filePath));
  const pdf = await getDocument({ data }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    fullText += reconstructPdfPageText(textContent) + "\n\n";
  }
  fullText = fullText.trim();
  if (fullText.length >= 100) return fullText;
  // 텍스트 레이어가 없는 이미지형(스캔) PDF → OCR 폴백 (브라우저 업로드와 동일 동작)
  process.stdout.write("이미지형 PDF 감지 → OCR 폴백... ");
  const ocrText = await extractPdfTextViaOcr(pdf);
  return ocrText.length > fullText.length ? ocrText : fullText;
};

// ── DOCX/DOC 텍스트 추출 ─────────────────────────────────────────────────────
const extractDocxText = async (filePath) => {
  const mammoth = await import("mammoth");
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.default.extractRawText({ buffer });
  return result.value.trim();
};

// ── 파일별 텍스트 추출 라우터 ─────────────────────────────────────────────────
const extractText = async (filePath) => {
  const ext = path.extname(filePath).toLowerCase().slice(1);
  switch (ext) {
    case "pdf":  return extractPdfText(filePath);
    case "docx":
    case "doc":  return extractDocxText(filePath);
    case "txt":  return fs.readFileSync(filePath, "utf-8");
    default: throw new Error(`지원하지 않는 형식: .${ext}`);
  }
};

// ── 프롬프트 (resumePrompt.ts 동기화) ────────────────────────────────────────
const RESUME_JSON_SCHEMA = {
  personal_info: { name: "", email: "", phone: "", birth_date: "", gender: "", address: "", profile_image_url: "" },
  professional_summary: { job_category: "", current_role: "", total_experience_months: 0, skill_grade: "", major_achievement: "", core_competencies: [], introduction: "", desired_position: "", desired_salary: "" },
  evaluation: { one_line_review: "" },
  skills: [{ skill_name: "", proficiency_level: "", notes: "" }],
  work_experiences: [{ start_date: "", end_date: "", company_name: "", department: "", job_title: "", responsibilities: "", tech_stack: [], key_achievements: [] }],
  projects: [{ start_date: "", end_date: "", project_name: "", client_company: "", role_and_tasks: "", tech_stack: [], outcomes: "", scale: "" }],
  educations: [{ start_date: "", end_date: "", school_name: "", major: "", graduation_status: "" }],
  certifications: [{ certification_name: "", issuer: "", acquisition_date: "" }],
  languages: [{ language: "", test_name: "", score: "", acquisition_date: "" }],
  awards: [{ competition_name: "", award_name: "", host_organization: "", award_date: "" }],
};

const SYSTEM_PROMPT = `
You are a high-performance resume data extraction engine. Your goal is COMPLETE and EXHAUSTIVE extraction — every field must be as detailed as the source text allows.

[CRITICAL RULES — TOTAL COMPLIANCE REQUIRED]
1. ZERO OMISSION: Extract EVERY work experience and EVERY project. If there are 20 projects, output 20 objects. Missing even one is a failure.
2. NO PLACEHOLDERS: Use the EXACT strings from the text. Never write "기타", "상세 내용", "프로젝트 경험" as a value.
3. TECH STACK EXTRACTION:
   - For each work_experience, scan the responsibilities text for all technology names (languages, frameworks, databases, tools, platforms, cloud services, etc.) and list them in "tech_stack" as an array of strings.
   - For each project, do the same in "tech_stack".
4. KEY ACHIEVEMENTS EXTRACTION:
   - For each work_experience, extract sentences or phrases that describe measurable results or notable accomplishments.
   - Prioritize phrases with numbers, percentages, before/after comparisons, or scale.
   - List these in "key_achievements" as an array of strings.
5. PROJECT OUTCOMES: For each project, extract the result/impact/outcome into "outcomes". Scale info goes in "scale".
6. DATE FORMAT: Use YYYY-MM format. Use "현재" if end date is missing or marked as current.
7. STRICT SCHEMA: Do NOT rename keys. Output valid JSON only.
8. SCHOOL NAME: Extract institution name ONLY. Do NOT append campus location in parentheses.
9. JOB CATEGORY: "professional_summary.job_category" MUST be exactly one of: "기획", "디자인", "퍼블리싱", "개발"
10. EDUCATION (NEVER EMPTY): "educations" must NEVER be an empty array. If no school found, use [{ "start_date": "", "end_date": "", "school_name": "", "major": "", "graduation_status": "고졸" }]
11. Section headers may be in ENGLISH: "EDUCATION" = 학력, "WORK EXPERIENCE"/"CAREER" = 경력, "PROJECT" = 프로젝트, "SKILLS" = 보유기술. Treat them the same as Korean headers.
`;

const buildParserMessages = (resumeContent) => [
  { role: "system", content: SYSTEM_PROMPT },
  {
    role: "user",
    content: `[JSON TEMPLATE]
(Schema omitted for brevity)

[Resume Content]
이름: 홍길동 생년월일 1990.01.01 성별 男 연락처 010-1234-5678 이메일 hong@example.com
학교명 및 전공 재학기간 구분 한국대학교 컴퓨터공학과 2009.03 ~ 2013.02 졸업
근무기간 회사명 부서명 직위 담당업무
2020.03 ~ 현재 카카오(주) 서버개발팀 선임 Java/Spring Boot 기반 REST API 설계 및 개발, MySQL·Redis 캐싱 구조 설계, AWS ECS 배포 자동화, API 응답속도 35% 개선
2017.01 ~ 2020.02 스타트업A 개발팀 사원 Node.js/Express 백엔드 개발, MongoDB 설계, React 프론트 일부 담당
프로젝트 이력
2024.01 ~ 2024.06 카카오페이 결제 모듈 고도화 카카오 내부. Spring Boot, Redis, Kafka 활용. 결제 처리량 2배 향상.`,
  },
  {
    role: "assistant",
    content: `{"personal_info":{"name":"홍길동","email":"hong@example.com","phone":"010-1234-5678","birth_date":"1990-01-01","gender":"남","address":"","profile_image_url":""},"professional_summary":{"job_category":"개발","current_role":"백엔드 개발자","total_experience_months":96,"skill_grade":"고급","major_achievement":"카카오 결제 모듈 고도화로 처리량 2배 향상","core_competencies":["Spring Boot REST API 설계","AWS 클라우드 운영","Redis 캐싱 설계"],"introduction":"카카오 출신 고급 백엔드 개발자","desired_position":"","desired_salary":""},"evaluation":{"one_line_review":"대용량 트래픽 처리와 시스템 성능 최적화 강점"},"skills":[{"skill_name":"Java","proficiency_level":"상","notes":""},{"skill_name":"Spring Boot","proficiency_level":"상","notes":""},{"skill_name":"MySQL","proficiency_level":"상","notes":""},{"skill_name":"Redis","proficiency_level":"상","notes":""}],"work_experiences":[{"start_date":"2020-03","end_date":"현재","company_name":"카카오(주)","department":"서버개발팀","job_title":"선임","responsibilities":"Java/Spring Boot 기반 REST API 설계 및 개발, MySQL·Redis 캐싱 구조 설계, AWS ECS 배포 자동화","tech_stack":["Java","Spring Boot","MySQL","Redis","AWS"],"key_achievements":["API 응답속도 35% 개선"]},{"start_date":"2017-01","end_date":"2020-02","company_name":"스타트업A","department":"개발팀","job_title":"사원","responsibilities":"Node.js/Express 백엔드 개발, MongoDB 설계, React 프론트 일부 담당","tech_stack":["Node.js","Express","MongoDB","React"],"key_achievements":[]}],"projects":[{"start_date":"2024-01","end_date":"2024-06","project_name":"카카오페이 결제 모듈 고도화","client_company":"카카오","role_and_tasks":"Spring Boot, Redis, Kafka 활용한 결제 모듈 고도화 개발","tech_stack":["Spring Boot","Redis","Kafka"],"outcomes":"결제 처리량 2배 향상","scale":""}],"educations":[{"start_date":"2009-03","end_date":"2013-02","school_name":"한국대학교","major":"컴퓨터공학과","graduation_status":"졸업"}],"certifications":[],"languages":[],"awards":[]}`,
  },
  {
    role: "user",
    content: `[JSON TEMPLATE]
${JSON.stringify(RESUME_JSON_SCHEMA, null, 2)}

[Resume Content]
${resumeContent}

Extract EVERY work experience and project without omission. For each entry, extract all tech_stack items and key_achievements found in the text. Do not use placeholders.
`,
  },
];

const buildProjectMessages = (projectChunk) => [
  {
    role: "system",
    content: `You are a data extraction engine. Extract EVERY project entry from the given text into a JSON array.

RULES:
1. Output ONLY a JSON array: [ {...}, {...}, ... ]
2. Extract EVERY line that contains a project name and/or date range. Do NOT skip any.
3. For each entry use this exact schema:
   { "start_date": "", "end_date": "", "project_name": "", "client_company": "", "role_and_tasks": "", "tech_stack": [], "outcomes": "", "scale": "" }
4. Dates: YYYY-MM format. Use "현재" if ongoing.
5. If client_company or role_and_tasks is missing, use "" (empty string). NEVER use "undefined".
6. tech_stack: extract any technology names mentioned. If none, use [].
7. TABLE COLUMNS: rows may use " | " between cells. Map cells to header cells (수행기간 | 프로젝트명 | 고객사 | 담당업무) positionally.
8. WRAPPED ROWS (CRITICAL): one table row may be SPLIT across two lines when cell text wraps — the first line has the start date ("2024.02 ~") and a following line begins with the end date only ("2024.09 | ..."). These lines are ONE project: merge them, joining fragmented cell text in reading order (e.g. "포인트 적립 시" + "스템 개편" → "포인트 적립 시스템 개편"). NEVER output a continuation line as a separate project.
9. Ignore header lines and rows belonging to a following non-project section (자격증/수상/학력 등).`,
  },
  {
    role: "user",
    content: `[Project Section Text]
수행기간 | 프로젝트명 | 고객사 | 담당업무
2024.01 ~ | 카카오페이 결제 모 | 카카오 | Spring Boot, Redis, Kafka로 개발. 결제 처리
2024.06 | 듈 고도화 | 량 2배 향상.
자격증
정보처리기사 | 한국산업인력공단 | 2014.11`,
  },
  {
    role: "assistant",
    content: `[{"start_date":"2024-01","end_date":"2024-06","project_name":"카카오페이 결제 모듈 고도화","client_company":"카카오","role_and_tasks":"Spring Boot, Redis, Kafka로 개발","tech_stack":["Spring Boot","Redis","Kafka"],"outcomes":"결제 처리량 2배 향상","scale":""}]`,
  },
  {
    role: "user",
    content: `[Project Section Text]
${projectChunk}

Extract ALL projects above as a JSON array. Do not skip any entry. Empty fields use "" not "undefined".`,
  },
];

// ── Ollama 호출 ───────────────────────────────────────────────────────────────
const LLM_OPTIONS = {
  temperature: 0.1,
  stop: ["<|endoftext|>", "<|im_start|>", "<|im_end|>", "Question:"],
  format: "json",
  num_ctx: 16384,
  num_predict: 8192,
};

// stream:true 로 받아 조각을 이어붙인다.
// (stream:false 는 생성이 끝나야 응답 헤더가 오는데, 긴 이력서는 생성에 5분 이상 걸려
//  Node fetch 의 기본 헤더 타임아웃 300초를 넘기고 "fetch failed"가 난다)
const callOllama = async (messages, useJsonFormat = true) => {
  const options = useJsonFormat ? LLM_OPTIONS : { ...LLM_OPTIONS, format: undefined };
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: TEXT_MODEL, messages, stream: true, options, keep_alive: -1 }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);

  const decoder = new TextDecoder();
  let content = "";
  let buf = "";
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) content += JSON.parse(line).message?.content ?? "";
    }
  }
  if (buf.trim()) content += JSON.parse(buf).message?.content ?? "";
  return content;
};

// ── 품질 점수 계산 ────────────────────────────────────────────────────────────
const VALID_JOB_CATEGORIES = ["기획", "디자인", "퍼블리싱", "개발"];

const scoreResult = (data) => {
  const scores = [];

  const check = (label, pts, condition) => scores.push({ label, pts, pass: !!condition });

  const pi = data.personal_info || {};
  const ps = data.professional_summary || {};

  check("이름 추출",                10, pi.name && pi.name !== "이름없음");
  check("연락처/이메일 추출",        10, pi.phone || pi.email);
  check("총 경력 개월수 추출",       10, ps.total_experience_months > 0);
  check("직군 분류 유효",            10, VALID_JOB_CATEGORIES.includes(ps.job_category));
  check("핵심역량 추출",             5,  Array.isArray(ps.core_competencies) && ps.core_competencies.length > 0);

  const skills = data.skills || [];
  check("기술스택 추출",             10, skills.length > 0);

  const works = data.work_experiences || [];
  check("경력사항 추출",             10, works.length > 0);
  check("경력별 tech_stack 추출",    10, works.some((w) => Array.isArray(w.tech_stack) && w.tech_stack.length > 0));
  check("경력별 key_achievements",   10, works.some((w) => Array.isArray(w.key_achievements) && w.key_achievements.length > 0));

  const projects = data.projects || [];
  check("프로젝트 추출",             5,  projects.length > 0);
  check("프로젝트 tech_stack 추출",  5,  projects.some((p) => Array.isArray(p.tech_stack) && p.tech_stack.length > 0));

  const edus = data.educations || data.education || [];
  check("학력 추출",                 5,  edus.length > 0 && (edus[0].school_name || edus[0].graduation_status));

  const total = scores.reduce((sum, s) => sum + s.pts, 0);
  const earned = scores.filter((s) => s.pass).reduce((sum, s) => sum + s.pts, 0);
  return { scores, earned, total };
};

// ── 단일 파일 처리 ────────────────────────────────────────────────────────────
const processFile = async (filePath) => {
  const filename = path.basename(filePath);
  console.log(`\n${"─".repeat(60)}`);
  console.log(`📄 ${filename}`);
  console.log(`${"─".repeat(60)}`);

  // 1. 텍스트 추출
  process.stdout.write("  [1/3] 텍스트 추출 중... ");
  const rawText = await extractText(filePath);
  console.log(`완료 (${rawText.length.toLocaleString()}자)`);

  if (rawText.length < 100) {
    console.log(`\n  ⚠️  텍스트가 너무 짧습니다 (${rawText.length}자).`);
    console.log(`     이미지형 PDF일 가능성이 높습니다.`);
    console.log(`     → 브라우저 업로드 시 Vision OCR이 자동 동작합니다.`);
    console.log(`     → 텍스트 레이어가 있는 PDF/DOCX 파일로 테스트하세요.\n`);
    throw new Error(`텍스트 추출 실패: ${rawText.length}자 (이미지형 PDF 추정)`);
  }
  if (verbose) {
    console.log("\n--- 추출된 텍스트 (앞 500자) ---");
    console.log(rawText.slice(0, 500));
    console.log("---\n");
  }

  // 2. 섹션 분리 & LLM 파싱
  const { base: baseText, projectChunks } = splitResumeIntoSections(rawText);
  process.stdout.write(`  [2/3] LLM 파싱 중 (프로젝트 청크 ${projectChunks.length}개)... `);

  const rawBase = await callOllama(buildParserMessages(projectChunks.length > 0 ? baseText : rawText));
  if (verbose) {
    console.log("\n--- raw LLM 응답 ---");
    console.log(rawBase.slice(0, 800));
    console.log("---\n");
  }

  const parsedData = sanitizeUndefined(JSON.parse(repairJson(rawBase)));

  if (projectChunks.length > 0) {
    const chunkResults = await Promise.all(
      projectChunks.map(async (chunk) => {
        try {
          const raw = await callOllama(buildProjectMessages(chunk));
          const repaired = repairJson(raw);
          const parsed = sanitizeUndefined(JSON.parse(repaired));
          return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          console.warn(`\n  ⚠️  프로젝트 청크 파싱 실패: ${e.message}`);
          return [];
        }
      }),
    );
    parsedData.projects = deduplicateProjects(chunkResults.flat());
  }
  // few-shot 예시를 그대로 베껴온 프로젝트/경력/학력 항목 제거 (resumeService.ts 동기화)
  stripExampleEntries(parsedData);
  console.log("완료");

  // 3. 품질 점수
  const { scores, earned, total } = scoreResult(parsedData);
  const grade = earned >= 90 ? "🟢" : earned >= 70 ? "🟡" : "🔴";
  console.log(`\n  [3/3] 품질 점수: ${grade} ${earned}/${total}점`);
  console.log("");
  scores.forEach(({ label, pts, pass }) => {
    console.log(`    ${pass ? "✅" : "❌"} ${label.padEnd(24)} ${pass ? `+${pts}` : ` 0`}/${pts}`);
  });

  // 요약 출력
  const ps = parsedData.professional_summary || {};
  const pi = parsedData.personal_info || {};
  console.log(`\n  📋 요약`);
  console.log(`    이름: ${pi.name || "(없음)"}`);
  console.log(`    직군: ${ps.job_category || "(없음)"}  /  직무: ${ps.current_role || "(없음)"}`);
  console.log(`    총경력: ${ps.total_experience_months || 0}개월`);
  console.log(`    경력사항: ${(parsedData.work_experiences || []).length}개`);
  console.log(`    프로젝트: ${(parsedData.projects || []).length}개`);
  console.log(`    기술스택: ${(parsedData.skills || []).map((s) => s.skill_name || s).join(", ").slice(0, 80) || "(없음)"}`);

  // 4. 결과 저장
  const result = {
    meta: {
      file: filename,
      tested_at: new Date().toISOString(),
      model: TEXT_MODEL,
      raw_text_length: rawText.length,
      project_chunks: projectChunks.length,
      score: { earned, total },
    },
    parsed: parsedData,
    quality: scores,
  };

  if (!noSave) {
    if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const safeName = filename.replace(/[^\w가-힣.-]/g, "_");
    const outPath = path.join(RESULTS_DIR, `${ts}_${safeName}.json`);
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf-8");
    console.log(`\n  💾 저장: test-results/${path.basename(outPath)}`);
  }

  return result;
};

// ── 메인 ──────────────────────────────────────────────────────────────────────
const main = async () => {
  console.log(`\n🔍 이력서 파싱 테스트 시작`);
  console.log(`   Ollama: ${OLLAMA_URL}  /  모델: ${TEXT_MODEL}`);
  console.log(`   폴더: test-resumes/  →  결과: ${noSave ? "(저장 안 함)" : "test-results/"}`);

  let files = [];

  if (specificFile) {
    const fp = path.isAbsolute(specificFile)
      ? specificFile
      : path.join(RESUMES_DIR, specificFile);
    if (!fs.existsSync(fp)) {
      console.error(`❌ 파일을 찾을 수 없습니다: ${fp}`);
      process.exit(1);
    }
    files = [fp];
  } else {
    if (!fs.existsSync(RESUMES_DIR)) {
      console.error(`❌ test-resumes/ 폴더가 없습니다.`);
      process.exit(1);
    }
    const SUPPORTED = [".pdf", ".docx", ".doc", ".txt"];
    files = fs
      .readdirSync(RESUMES_DIR)
      .filter((f) => SUPPORTED.includes(path.extname(f).toLowerCase()))
      .map((f) => path.join(RESUMES_DIR, f));

    if (files.length === 0) {
      console.error("❌ test-resumes/ 에 지원 파일이 없습니다. (pdf/docx/doc/txt)");
      process.exit(1);
    }
  }

  console.log(`\n총 ${files.length}개 파일 처리`);

  const results = [];
  for (const fp of files) {
    try {
      const r = await processFile(fp);
      results.push(r);
    } catch (e) {
      console.error(`\n  ❌ 처리 실패: ${e.message}`);
      results.push({ meta: { file: path.basename(fp), error: e.message } });
    }
  }

  // 전체 요약
  if (results.length > 1) {
    console.log(`\n${"═".repeat(60)}`);
    console.log("📊 전체 결과 요약");
    console.log(`${"═".repeat(60)}`);
    results.forEach((r) => {
      if (r.meta.error) {
        console.log(`  ❌ ${r.meta.file}  →  오류: ${r.meta.error}`);
      } else {
        const { earned, total } = r.meta.score;
        const grade = earned >= 90 ? "🟢" : earned >= 70 ? "🟡" : "🔴";
        console.log(`  ${grade} ${String(earned).padStart(3)}/${total}  ${r.meta.file}`);
      }
    });
  }

  console.log(`\n✅ 완료\n`);
};

main().catch((e) => {
  console.error("실행 오류:", e);
  process.exit(1);
});
