#!/usr/bin/env node
/**
 * 이력서 폴더 → Supabase DB 일괄 등록 스크립트 (Node 전용)
 *
 * resumes-inbox/ 폴더(또는 인자로 지정한 폴더)의 이력서 파일을 하나씩 돌면서
 * 앱(브라우저)의 업로드 로직(src/services/resumeService.ts)과 동일하게
 *   1) 텍스트 추출(PDF/DOCX/DOC/TXT)
 *   2) Ollama LLM 파싱(기본정보·경력·학력·기술 + 프로젝트 청크)
 *   3) bge-m3 임베딩 생성
 *   4) ResumeData → 평문 컬럼/JSONB 로 분해 (암호화 없음)
 *   5) resumes 테이블 INSERT (name / job_category / total_experience_months /
 *      평문 컬럼들(email·phone·skills·work_experiences ...) / embedding / rating)
 * 를 수행하고, 성공한 파일은 _done/ 하위로 이동해 재실행 시 중복 INSERT를 막는다.
 *
 * 사용법 (보통은 루트의 seed-resumes.bat 로 실행):
 *   node scripts/seedResumesToDB.mjs                   # resumes-inbox/ 전체
 *   node scripts/seedResumesToDB.mjs "D:\\이력서모음"   # 다른 폴더 지정
 *   node scripts/seedResumesToDB.mjs --dir <path>      # 폴더 지정(인자 형태)
 *   node scripts/seedResumesToDB.mjs --file <path>     # 파일 1개만
 *   node scripts/seedResumesToDB.mjs --dry-run         # 파싱/임베딩만, DB 저장·이동 안 함
 *   node scripts/seedResumesToDB.mjs --no-move         # 저장은 하되 _done/ 이동 안 함
 *   node scripts/seedResumesToDB.mjs --verbose         # 추출 텍스트/LLM 응답 일부 출력
 *
 * 주의: 입력 파일·_done/ 폴더에는 실제 PII가 평문으로 남으므로 커밋/공유하지 말 것.
 *      (.gitignore 에서 resumes-inbox/ 는 README 외 전부 무시)
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

// ── 환경변수 ──────────────────────────────────────────────────────────────────
const OLLAMA_URL = process.env.VITE_OLLAMA_URL;
let TEXT_MODEL = process.env.VITE_LLAMA_TEXT_MODEL; // --model 로 덮어쓸 수 있음(모델 비교용)
const EMBEDDING_MODEL = process.env.VITE_LLAMA_EMBEDDING_MODEL;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const missingEnv = [
  ["VITE_OLLAMA_URL", OLLAMA_URL],
  ["VITE_LLAMA_TEXT_MODEL", TEXT_MODEL],
  ["VITE_LLAMA_EMBEDDING_MODEL", EMBEDDING_MODEL],
  ["VITE_SUPABASE_URL", SUPABASE_URL],
  ["VITE_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY],
].filter(([, v]) => !v).map(([k]) => k);

if (missingEnv.length) {
  console.error(`❌ .env 에 다음 값이 없습니다: ${missingEnv.join(", ")}`);
  process.exit(1);
}

// ── CLI 인수 ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name) => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : undefined; };
const hasFlag = (name) => args.includes(name);

const dirArg = getArg("--dir");
const specificFile = getArg("--file");
const dryRun = hasFlag("--dry-run");
const noMove = hasFlag("--no-move");
const verbose = hasFlag("--verbose");
const modelOverride = getArg("--model"); // 예: --model gemma4:e4b (모델 비교용)
if (modelOverride) TEXT_MODEL = modelOverride;

// 첫 번째 비(非)플래그 인수를 폴더 경로로 인정 (예: seed-resumes.bat "D:\이력서")
const positionalDir = args.find((a, i) => {
  if (a.startsWith("--")) return false;
  const prev = args[i - 1];
  return prev !== "--dir" && prev !== "--file"; // 옵션 값이 아닌 경우만
});

const DEFAULT_DIR = path.join(ROOT, "resumes-inbox");
const TARGET_DIR = path.resolve(dirArg || positionalDir || DEFAULT_DIR);

const SUPPORTED = [".pdf", ".docx", ".doc", ".txt"];

// ════════════════════════════════════════════════════════════════════════════
//  텍스트 추출 (scripts/testParseLocal.mjs 와 동일 로직)
// ════════════════════════════════════════════════════════════════════════════
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

const extractPdfText = async (filePath) => {
  await loadPdfjs();
  const data = new Uint8Array(fs.readFileSync(filePath));
  const pdf = await getDocument({ data }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    fullText += textContent.items.map((item) => item.str).join(" ") + "\n";
  }
  return fullText.trim();
};

const extractDocxText = async (filePath) => {
  const mammoth = await import("mammoth");
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.default.extractRawText({ buffer });
  return result.value.trim();
};

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

// ════════════════════════════════════════════════════════════════════════════
//  프롬프트 (src/constants/resumePrompt.ts 동기화 — 수정 시 양쪽 함께 변경)
// ════════════════════════════════════════════════════════════════════════════
const DEFAULT_EDUCATION_LEVEL = "고졸";

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

const RESUME_PARSER_SYSTEM_PROMPT = `
You are a high-performance resume data extraction engine. Your goal is COMPLETE and EXHAUSTIVE extraction — every field must be as detailed as the source text allows.

[CRITICAL RULES — TOTAL COMPLIANCE REQUIRED]
1. ZERO OMISSION: Extract EVERY work experience and EVERY project. If there are 20 projects, output 20 objects. Missing even one is a failure.
2. NO PLACEHOLDERS: Use the EXACT strings from the text. Never write "기타", "상세 내용", "프로젝트 경험" as a value.
3. TECH STACK EXTRACTION:
   - For each work_experience, scan the responsibilities text for all technology names (languages, frameworks, databases, tools, platforms, cloud services, etc.) and list them in "tech_stack" as an array of strings.
   - For each project, do the same in "tech_stack".
   - Examples of tech to capture: Java, Spring Boot, React, Vue, MySQL, Redis, AWS, Docker, Kubernetes, Jenkins, Kafka, Python, Node.js, TypeScript, etc.
4. KEY ACHIEVEMENTS EXTRACTION:
   - For each work_experience, extract sentences or phrases that describe measurable results or notable accomplishments.
   - Prioritize phrases with numbers, percentages, before/after comparisons, or scale (e.g., "API 응답속도 40% 개선", "월 500만 PV 서비스 운영", "10인 개발팀 리드").
   - List these in "key_achievements" as an array of strings.
5. PROJECT OUTCOMES:
   - For each project, extract the result/impact/outcome of the project into the "outcomes" field.
   - If scale (team size, budget, duration) is mentioned, put it in "scale".
6. DATE FORMAT: Use YYYY-MM format. Use "현재" if end date is missing or marked as current.
7. STRICT SCHEMA: Do NOT rename keys. Output valid JSON only.
8. SCHOOL NAME: For "school_name", extract the institution name ONLY. Do NOT append campus location or region in parentheses (e.g., use "인제대학교" not "인제대학교 (김해)").
8. JOB CATEGORY: "professional_summary.job_category" MUST be exactly one of these four values — no other value is allowed:
   - "기획"  (service planning, UI/UX planning, PM, PO, strategy)
   - "디자인" (UI/UX design, graphic design, web design, motion, editorial)
   - "퍼블리싱" (web publishing, HTML/CSS, markup)
   - "개발"  (frontend, backend, fullstack, mobile, DevOps, data engineering)
   If the person covers multiple areas, pick the ONE that best describes their PRIMARY role.
9. EDUCATION (NEVER EMPTY): "educations" must NEVER be an empty array.
   - Scan the full resume for education history. Priority order: 대학원 > 대학교 > fallback.
   - If 대학원 entries exist → include them (along with any 대학교 entries).
   - If no 대학원 but 대학교 entries exist → include those.
   - If NEITHER 대학원 NOR 대학교 is found anywhere in the resume → set educations to exactly:
     [{ "start_date": "", "end_date": "", "school_name": "", "major": "", "graduation_status": "${DEFAULT_EDUCATION_LEVEL}" }]
10. VERTICAL / TRANSPOSED TABLES (CRITICAL — most resumes look like this): The text comes from DOCX/PDF tables that became VERTICAL. A field label or a column-header line is followed by its value(s) on the FOLLOWING lines, NOT on the same line. You MUST still extract everything.
   - Label→value: a label line, then its value on the next line(s).
     e.g. "성명\\n이 정 민" → name; "생년월일\\n2001.02.27 (만 24세)" → birth_date "2001-02"; "거주지 주소\\n인천광역시 계양구" → address; "기술등급\\n초급" → skill_grade.
   - Header→rows: a header line lists columns, then each following line is one row — map positionally.
     학력 header "재학기간 학교명 전공 구분" → rows like "2019.03 ~ 2023.02 명지대학교 디지털콘텐츠디자인 졸업".
     경력 header "근무기간 회사명 부서 직위 담당업무"; 프로젝트 header "기간 프로젝트명 고객사 역할/담당업무".
   - NEVER leave educations / work_experiences / skills / certifications empty just because the layout is transposed — read the rows under each header.
11. NAMES WITH SPACES: A name may be spaced syllable-by-syllable (e.g. "이 정 민", "강 석 규"). Remove the internal spaces → "이정민", "강석규".

[ARRAY RULES]
- "work_experiences": one object per employment entry (company change = new entry).
- "projects": one object per project listed. Each line with a date range and project name is a separate entry.
- "tech_stack": always an array of strings, never a single string.
- "key_achievements": always an array of strings.

[HOW TO EXTRACT tech_stack]
Scan the full text of "responsibilities" and "role_and_tasks". Any technology, tool, library, platform, or cloud service name found → add to "tech_stack". Do not leave it empty if technologies are mentioned anywhere in the description.
`;

const RESUME_PARSER_MESSAGES = (resumeContent) => [
  { role: "system", content: RESUME_PARSER_SYSTEM_PROMPT },
  {
    role: "user",
    content: `[JSON TEMPLATE]
(Schema omitted for brevity)

[Resume Content]
이름: 홍길동 생년월일 1990.01.01 성별 男 연락처 010-1234-5678 이메일 hong@example.com
학교명 및 전공 재학기간 구분 한국대학교 컴퓨터공학과 2009.03 ~ 2013.02 졸업
근무기간 회사명 부서명 직위 담당업무
2020.03 ~ 현재 카카오(주) 서버개발팀 선임 Java/Spring Boot 기반 REST API 설계 및 개발, MySQL·Redis 캐싱 구조 설계, AWS ECS 배포 자동화, API 응답속도 35% 개선, 코드 리뷰 문화 도입으로 버그 발생률 50% 감소
2017.01 ~ 2020.02 스타트업A 개발팀 사원 Node.js/Express 백엔드 개발, MongoDB 설계, React 프론트 일부 담당, 하루 10만 건 주문 처리 시스템 구축
프로젝트 이력
2024.01 ~ 2024.06 카카오페이 결제 모듈 고도화 카카오 내부 프로젝트. Spring Boot, Redis, Kafka 활용. 결제 처리량 2배 향상, 장애 대응 시간 60% 단축. 팀 5인.
2023.03 ~ 2023.09 사내 모니터링 대시보드 구축 Grafana, Prometheus, Kubernetes 기반 실시간 모니터링 시스템 개발. 온콜 알람 자동화로 야간 장애 대응 90% 감소.`,
  },
  {
    role: "assistant",
    content: `{"personal_info":{"name":"홍길동","email":"hong@example.com","phone":"010-1234-5678","birth_date":"1990-01-01","gender":"남","address":"","profile_image_url":""},"professional_summary":{"job_category":"개발","current_role":"백엔드 개발자","total_experience_months":96,"skill_grade":"고급","major_achievement":"카카오 결제 모듈 고도화로 처리량 2배 향상 및 API 응답속도 35% 개선","core_competencies":["Spring Boot 기반 REST API 설계","AWS 클라우드 운영","대용량 트래픽 처리","Redis 캐싱 설계"],"introduction":"카카오 출신 고급 백엔드 개발자로, 대용량 트래픽 처리와 시스템 성능 최적화에 강점이 있습니다.","desired_position":"","desired_salary":""},"evaluation":{"one_line_review":"카카오 출신 고급 백엔드 개발자로 대용량 시스템 설계와 성능 개선 경험이 풍부합니다."},"skills":[{"skill_name":"Java","proficiency_level":"상","notes":""},{"skill_name":"Spring Boot","proficiency_level":"상","notes":""},{"skill_name":"MySQL","proficiency_level":"상","notes":""},{"skill_name":"Redis","proficiency_level":"상","notes":""},{"skill_name":"AWS","proficiency_level":"중","notes":""}],"work_experiences":[{"start_date":"2020-03","end_date":"현재","company_name":"카카오(주)","department":"서버개발팀","job_title":"선임","responsibilities":"Java/Spring Boot 기반 REST API 설계 및 개발, MySQL·Redis 캐싱 구조 설계, AWS ECS 배포 자동화, 코드 리뷰 문화 도입","tech_stack":["Java","Spring Boot","MySQL","Redis","AWS","AWS ECS"],"key_achievements":["API 응답속도 35% 개선","코드 리뷰 문화 도입으로 버그 발생률 50% 감소"]},{"start_date":"2017-01","end_date":"2020-02","company_name":"스타트업A","department":"개발팀","job_title":"사원","responsibilities":"Node.js/Express 백엔드 개발, MongoDB 설계, React 프론트 일부 담당","tech_stack":["Node.js","Express","MongoDB","React"],"key_achievements":["하루 10만 건 주문 처리 시스템 구축"]}],"projects":[{"start_date":"2024-01","end_date":"2024-06","project_name":"카카오페이 결제 모듈 고도화","client_company":"카카오","role_and_tasks":"Spring Boot, Redis, Kafka 활용한 결제 모듈 고도화 개발","tech_stack":["Spring Boot","Redis","Kafka"],"outcomes":"결제 처리량 2배 향상, 장애 대응 시간 60% 단축","scale":"팀 5인"},{"start_date":"2023-03","end_date":"2023-09","project_name":"사내 모니터링 대시보드 구축","client_company":"카카오","role_and_tasks":"Grafana, Prometheus, Kubernetes 기반 실시간 모니터링 시스템 개발","tech_stack":["Grafana","Prometheus","Kubernetes"],"outcomes":"온콜 알람 자동화로 야간 장애 대응 90% 감소","scale":""}],"educations":[{"start_date":"2009-03","end_date":"2013-02","school_name":"한국대학교","major":"컴퓨터공학과","graduation_status":"졸업"}],"certifications":[],"languages":[],"awards":[]}`,
  },
  {
    role: "user",
    content: `[Resume Content]
PROFILE
성명
홍 길 동
담당업무
디자인
생년월일
1990.01.01 (만 35세)
성별
남
업무경력
8년 0개월
기술등급
고급
거주지 주소
서울특별시 강남구
학력
재학기간  학교명  전공  구분
2009.03 ~ 2013.02  한국대학교  시각디자인  졸업
보유기술
Figma, Photoshop, Illustrator, HTML/CSS
경력
근무기간  근무 회사명  부서  직위  담당업무
2016.03 ~ 현재  디자인컴퍼니  브랜드디자인팀  팀장  브랜드 아이덴티티 및 UI/UX 디자인 총괄
프로젝트 수행경력
수행기간  프로젝트명  고객사  담당업무
2024.01 ~ 2024.06  삼성 브랜드 리뉴얼  삼성전자  메인 UI 디자인 및 디자인시스템 구축. 사용성 평가 20% 개선.

위 내용은 표가 세로로 펼쳐진(VERTICAL/TRANSPOSED) 레이아웃이다. 모든 섹션(학력/경력/기술/프로젝트)을 빠짐없이 추출하라.`,
  },
  {
    role: "assistant",
    content: `{"personal_info":{"name":"홍길동","email":"","phone":"","birth_date":"1990-01-01","gender":"남","address":"서울특별시 강남구","profile_image_url":""},"professional_summary":{"job_category":"디자인","current_role":"브랜드/UIUX 디자이너","total_experience_months":96,"skill_grade":"고급","major_achievement":"삼성 브랜드 리뉴얼 메인 UI 디자인 및 디자인시스템 구축","core_competencies":["브랜드 아이덴티티 디자인","UI/UX 디자인","디자인시스템 구축"],"introduction":"","desired_position":"","desired_salary":""},"evaluation":{"one_line_review":"브랜드와 UI/UX를 아우르는 고급 디자이너"},"skills":[{"skill_name":"Figma","proficiency_level":"상","notes":""},{"skill_name":"Photoshop","proficiency_level":"상","notes":""},{"skill_name":"Illustrator","proficiency_level":"상","notes":""},{"skill_name":"HTML/CSS","proficiency_level":"중","notes":""}],"work_experiences":[{"start_date":"2016-03","end_date":"현재","company_name":"디자인컴퍼니","department":"브랜드디자인팀","job_title":"팀장","responsibilities":"브랜드 아이덴티티 및 UI/UX 디자인 총괄","tech_stack":["Figma"],"key_achievements":[]}],"projects":[{"start_date":"2024-01","end_date":"2024-06","project_name":"삼성 브랜드 리뉴얼","client_company":"삼성전자","role_and_tasks":"메인 UI 디자인 및 디자인시스템 구축","tech_stack":["Figma"],"outcomes":"사용성 평가 20% 개선","scale":""}],"educations":[{"start_date":"2009-03","end_date":"2013-02","school_name":"한국대학교","major":"시각디자인","graduation_status":"졸업"}],"certifications":[],"languages":[],"awards":[]}`,
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

const RESUME_PROJECTS_ONLY_MESSAGES = (projectChunk) => [
  {
    role: "system",
    content: `You are a data extraction engine. Extract EVERY project entry from the given text into a JSON array.

RULES:
1. Output ONLY a JSON array: [ {...}, {...}, ... ]
2. Extract EVERY line that contains a project name and/or date range. Do NOT skip any.
3. For each entry use this exact schema:
   { "start_date": "", "end_date": "", "project_name": "", "client_company": "", "role_and_tasks": "", "tech_stack": [], "outcomes": "", "scale": "" }
4. Dates: YYYY-MM format. Use "현재" if ongoing.
5. If client_company or role_and_tasks is missing from the text, use "" (empty string). NEVER use "undefined".
6. tech_stack: extract any technology names mentioned in role_and_tasks. If none mentioned, use [].
7. Do NOT include any key outside the schema above.`,
  },
  {
    role: "user",
    content: `[Project Section Text]
2024.01 ~ 2024.06 카카오페이 결제 모듈 고도화 카카오 Spring Boot, Redis, Kafka로 개발. 결제 처리량 2배 향상.
2023.03 ~ 2023.09 사내 모니터링 대시보드 구축 카카오 Grafana, Prometheus, Kubernetes로 구축. 야간 장애 대응 90% 감소.`,
  },
  {
    role: "assistant",
    content: `[{"start_date":"2024-01","end_date":"2024-06","project_name":"카카오페이 결제 모듈 고도화","client_company":"카카오","role_and_tasks":"Spring Boot, Redis, Kafka로 개발","tech_stack":["Spring Boot","Redis","Kafka"],"outcomes":"결제 처리량 2배 향상","scale":""},{"start_date":"2023-03","end_date":"2023-09","project_name":"사내 모니터링 대시보드 구축","client_company":"카카오","role_and_tasks":"Grafana, Prometheus, Kubernetes로 구축","tech_stack":["Grafana","Prometheus","Kubernetes"],"outcomes":"야간 장애 대응 90% 감소","scale":""}]`,
  },
  {
    role: "user",
    content: `[Project Section Text]
${projectChunk}

Extract ALL projects above as a JSON array. Do not skip any entry. Empty fields use "" not "undefined".`,
  },
];

// 알려진 섹션 헤더로 텍스트를 base / 프로젝트 청크로 분리
const splitResumeIntoSections = (text) => {
  const projectSectionPattern = /(?:수상경력|프로젝트\s*수행\s*경력|프로젝트\s*이력|수행\s*경력|PROJECT)/i;
  const matchIdx = text.search(projectSectionPattern);

  if (matchIdx === -1) return { base: text, projectChunks: [] };

  const baseText = text.substring(0, matchIdx).trim();
  const projectText = text.substring(matchIdx).trim();

  const lines = projectText.split("\n").filter((l) => l.trim());
  const projectEntries = [];
  let current = "";

  for (const line of lines) {
    const isNew = /^\s*(\d{4}[.\-]\d{2}|\d{4}년)/.test(line) || /^\s*undefined/.test(line);
    if (isNew && current.trim()) {
      projectEntries.push(current.trim());
      current = line;
    } else {
      current += (current ? "\n" : "") + line;
    }
  }
  if (current.trim()) projectEntries.push(current.trim());

  const chunkSize = Math.ceil(projectEntries.length / 3);
  const projectChunks = [];
  for (let i = 0; i < projectEntries.length; i += chunkSize) {
    const chunk = projectEntries.slice(i, i + chunkSize).join("\n");
    if (chunk.trim()) projectChunks.push(chunk);
  }

  return { base: baseText, projectChunks };
};

// ════════════════════════════════════════════════════════════════════════════
//  Ollama 호출 (src/apis/ollama.ts 와 동일 동작 — keep_alive:-1 로 모델 상주)
// ════════════════════════════════════════════════════════════════════════════
// 배치(비대화형)라 앱(120s)보다 넉넉히 잡되, 모델이 멈추면 무한 대기하지 않도록 상한을 둔다.
const CHAT_TIMEOUT_MS = 180_000;
const EMBEDDING_TIMEOUT_MS = 30_000;

const LLM_OPTIONS = {
  temperature: 0.1,
  stop: ["<|endoftext|>", "<|im_start|>", "<|im_end|>", "Question:"],
  format: "json",
  num_ctx: 16384,
  num_predict: 8192,
};

const fetchWithTimeout = async (url, init, timeoutMs, label) => {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new Error(`${label} 타임아웃 (${timeoutMs / 1000}초 초과) — Ollama 모델 응답 없음`);
    }
    throw e;
  }
};

const callOllama = async (messages) => {
  const res = await fetchWithTimeout(
    `${OLLAMA_URL}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: TEXT_MODEL, messages, stream: false, options: LLM_OPTIONS, keep_alive: -1 }),
    },
    CHAT_TIMEOUT_MS,
    `Ollama 채팅(${TEXT_MODEL})`,
  );
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const result = await res.json();
  return result.message.content;
};

const getEmbedding = async (text) => {
  const res = await fetchWithTimeout(
    `${OLLAMA_URL}/api/embeddings`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text, keep_alive: -1 }),
    },
    EMBEDDING_TIMEOUT_MS,
    "Ollama 임베딩",
  );
  if (!res.ok) throw new Error(`Ollama Embedding ${res.status}: ${await res.text()}`);
  const result = await res.json();
  return result.embedding;
};

// ════════════════════════════════════════════════════════════════════════════
//  JSON 복구 / 정리 (src/services/resumeService.ts 와 동일 로직)
// ════════════════════════════════════════════════════════════════════════════
const extractJsonText = (raw) => {
  const objStart = raw.indexOf("{");
  const arrStart = raw.indexOf("[");
  const isArray = arrStart !== -1 && (objStart === -1 || arrStart < objStart);
  if (isArray) {
    const end = raw.lastIndexOf("]");
    if (arrStart === -1 || end === -1) throw new Error("JSON 배열을 찾을 수 없습니다.");
    return raw.substring(arrStart, end + 1);
  }
  const end = raw.lastIndexOf("}");
  if (objStart === -1 || end === -1) throw new Error("JSON 객체를 찾을 수 없습니다.");
  return raw.substring(objStart, end + 1);
};

const repairTruncatedJson = (raw) => {
  const text = extractJsonText(raw);
  try { JSON.parse(text); return text; } catch {}

  const stack = [];
  const pairs = { "{": "}", "[": "]" };
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) { if (ch === '"' && text[i - 1] !== "\\") inString = false; continue; }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  const repaired = text.trimEnd().replace(/,\s*$/, "") + stack.reverse().map((c) => pairs[c]).join("");
  JSON.parse(repaired); // 실패 시 예외 발생
  return repaired;
};

const sanitizeUndefined = (obj) => {
  if (Array.isArray(obj)) return obj.map(sanitizeUndefined);
  if (obj !== null && typeof obj === "object")
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, sanitizeUndefined(v)]));
  if (typeof obj === "string" && obj.trim().toLowerCase() === "undefined") return "";
  return obj;
};

const deduplicateProjects = (projects) => {
  const seen = new Set();
  return projects.filter((p) => {
    const key = (p.project_name || "").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// ── 임베딩 텍스트 조립 (src/services/resumeService.ts buildEmbeddingText 동기화) ──
const mapJoin = (arr, fn, sep) => (Array.isArray(arr) ? arr.map(fn).join(sep) : "");

const buildEmbeddingText = (parsedData) => {
  const jobCategory = parsedData.professional_summary?.job_category || "직무미상";
  const currentRole = parsedData.professional_summary?.current_role || "";

  const skillString = mapJoin(parsedData.skills, (s) => (typeof s === "string" ? s : s.skill_name || ""), ", ");
  const competencyString = mapJoin(parsedData.professional_summary?.core_competencies, (c) => c, " ");

  const projectString = mapJoin(parsedData.projects, (p) => {
    const techStr = Array.isArray(p.tech_stack) ? p.tech_stack.join(", ") : "";
    const outcomeStr = p.outcomes || "";
    return [p.project_name, techStr, outcomeStr].filter(Boolean).join(" | ");
  }, "\n");

  const workTechString = mapJoin(parsedData.work_experiences, (w) => {
    const techStr = Array.isArray(w.tech_stack) ? w.tech_stack.join(", ") : "";
    const achieveStr = Array.isArray(w.key_achievements) ? w.key_achievements.join(". ") : "";
    return [w.company_name, w.job_title, techStr, achieveStr].filter(Boolean).join(" | ");
  }, "\n");

  return `직군: ${jobCategory}\n직무: ${currentRole}\n기술스택: ${skillString}\n핵심역량: ${competencyString}\n주요프로젝트:\n${projectString}\n경력상세:\n${workTechString}`.trim();
};

// ── 파일명에서 이름/등급 추출 (src/services/resumeService.ts 동기화) ──────────
const CANDIDATE_GRADES = ["초급", "중급", "고급", "특급"];

const FILENAME_STOPWORDS = [
  "경력기술서", "자기소개서", "재직증명서", "경력증명서",
  "포트폴리오", "지원서", "이력서", "자소서", "경력", "이력",
  "국문", "영문", "최종", "수정", "사본", "제출", "양식",
  "resume", "portfolio", "cv",
];

const extractGradeFromFilename = (filename) => {
  const base = filename.replace(/\.[^.]+$/, "");
  return CANDIDATE_GRADES.find((g) => base.includes(g)) ?? null;
};

const extractNameFromFilename = (filename) => {
  let base = filename.replace(/\.[^.]+$/, "");
  for (const word of FILENAME_STOPWORDS) base = base.replace(new RegExp(word, "gi"), " ");
  const token = base
    .replace(/[^가-힣]+/g, " ")
    .trim()
    .split(/\s+/)
    .find((t) => t.length >= 2 && t.length <= 5);
  return token || null;
};

// 이메일 추출 (src/services/resumeService.ts extractEmailFromText 와 동기화)
// 로컬파트@도메인.TLD(2자 이상). .com / .co.kr 등 매칭. LLM 누락 시 원문에서 보강.
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

const extractEmailFromText = (text) => {
  if (!text) return null;
  const direct = text.match(EMAIL_REGEX);
  if (direct) return direct[0];
  // PDF 추출 시 "hong @ example. com" 처럼 @·. 주변 공백이 끼는 경우 보정 후 재시도
  const despaced = text.replace(/\s*([@.])\s*/g, "$1");
  return despaced.match(EMAIL_REGEX)?.[0] ?? null;
};

// 인터뷰 문서(이력서 아님) 판별 (src/services/resumeService.ts isInterviewDocument 와 동기화)
// 파일명 전체 + 본문 상단(제목 영역)을 공백 무시하고 키워드와 대조. 본문 상단만 보아 오제외 방지.
const INTERVIEW_DOC_KEYWORDS = [
  "인터뷰질의서", "인터뷰질문지", "인터뷰질문서", "인터뷰시트",
  "전화인터뷰", "전화면접",
  "면접질의서", "면접질문지",
];

const stripSpaces = (s) => s.replace(/\s+/g, "");

const isInterviewDocument = (filename, text) => {
  const nameKey = stripSpaces(filename);
  const titleKey = stripSpaces(text.slice(0, 250)); // 본문 상단(제목) 영역만 검사
  return INTERVIEW_DOC_KEYWORDS.some((k) => nameKey.includes(k) || titleKey.includes(k));
};

// ── ResumeData → 컬럼 매핑 (src/utils/resumeMapper.ts resumeDataToColumns 와 동기화) ──
// JSON current_role 은 SQL 예약어 회피로 컬럼 current_position 에 매핑.
const resumeDataToColumns = (rd) => {
  const pi = rd?.personal_info ?? {};
  const ps = rd?.professional_summary ?? {};
  return {
    email: pi.email ?? null,
    phone: pi.phone ?? null,
    birth_date: pi.birth_date ?? null,
    gender: pi.gender ?? null,
    address: pi.address ?? null,
    profile_image_url: pi.profile_image_url ?? null,
    current_position: ps.current_role ?? null,
    skill_grade: ps.skill_grade ?? null,
    file_grade: rd?.file_grade ?? null,
    major_achievement: ps.major_achievement ?? null,
    introduction: ps.introduction ?? null,
    desired_position: ps.desired_position ?? pi.desired_position ?? null,
    desired_salary: ps.desired_salary ?? null,
    one_line_review: rd?.evaluation?.one_line_review ?? null,
    core_competencies: ps.core_competencies ?? [],
    skills: rd?.skills ?? [],
    work_experiences: rd?.work_experiences ?? [],
    projects: rd?.projects ?? [],
    educations: rd?.educations ?? rd?.education ?? [],
    certifications: rd?.certifications ?? [],
    languages: rd?.languages ?? [],
    awards: rd?.awards ?? [],
    abilities: rd?.abilities ?? [],
  };
};

// ════════════════════════════════════════════════════════════════════════════
//  단일 파일 처리: 파싱 → 임베딩 → 암호화 → INSERT
//  (src/services/resumeService.ts parseAndSaveResume 와 동일 흐름)
// ════════════════════════════════════════════════════════════════════════════
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const parseResumeFile = async (filePath) => {
  const filename = path.basename(filePath);

  // 1. 텍스트 추출
  process.stdout.write("  [1/4] 텍스트 추출... ");
  const extractedText = await extractText(filePath);
  console.log(`완료 (${extractedText.length.toLocaleString()}자)`);

  if (extractedText.length < 100) {
    // 이미지형 PDF는 브라우저 업로드 시에만 Vision OCR이 동작한다(이 스크립트는 미지원).
    throw new Error(`텍스트 추출 실패: ${extractedText.length}자 (이미지형 PDF 추정 — 브라우저에서 업로드 필요)`);
  }
  if (verbose) {
    console.log("\n--- 추출 텍스트(앞 400자) ---\n" + extractedText.slice(0, 400) + "\n---");
  }

  // 이력서가 아닌 인터뷰 문서(인터뷰 질의서/전화 인터뷰 등)는 LLM 파싱 전에 제외
  if (isInterviewDocument(filename, extractedText)) {
    return { skipped: true, reason: "이력서가 아닌 인터뷰 문서(인터뷰 질의서/전화 인터뷰 등)" };
  }

  // 2. 섹션 분리 + LLM 파싱
  const { base: baseText, projectChunks } = splitResumeIntoSections(extractedText);
  process.stdout.write(`  [2/4] LLM 파싱 (프로젝트 청크 ${projectChunks.length}개)... `);

  const rawBase = await callOllama(RESUME_PARSER_MESSAGES(projectChunks.length > 0 ? baseText : extractedText));
  if (verbose) console.log("\n--- raw LLM(앞 500자) ---\n" + rawBase.slice(0, 500) + "\n---");

  const parsedData = sanitizeUndefined(JSON.parse(repairTruncatedJson(rawBase)));

  if (Array.isArray(parsedData.abilities)) {
    parsedData.abilities = parsedData.abilities.map((item) => (typeof item === "string" ? { desc: item } : item));
  }

  if (projectChunks.length > 0) {
    const chunkResults = await Promise.all(
      projectChunks.map(async (chunk) => {
        try {
          const parsed = sanitizeUndefined(JSON.parse(repairTruncatedJson(await callOllama(RESUME_PROJECTS_ONLY_MESSAGES(chunk)))));
          return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          console.warn(`\n  ⚠️  프로젝트 청크 파싱 실패(건너뜀): ${e.message}`);
          return [];
        }
      }),
    );
    parsedData.projects = deduplicateProjects(chunkResults.flat());
  }
  console.log("완료");

  // 3. 이름/등급 보강 (파싱값 우선, 없으면 파일명)
  const parsedName = parsedData.personal_info?.name?.replace(/\s+/g, "");
  const nameFromFile = parsedName ? null : extractNameFromFilename(filename);
  if (nameFromFile) parsedData.personal_info = { ...parsedData.personal_info, name: nameFromFile };
  const originalName = parsedName || nameFromFile || "이름없음";

  // 이메일 누락 방지: 파싱값 우선(정규화), 없으면 원문 전체에서 정규식으로 추출해 보강
  const emailFromParsed = extractEmailFromText(parsedData.personal_info?.email ?? "");
  const finalEmail = emailFromParsed ?? extractEmailFromText(extractedText);
  if (finalEmail) parsedData.personal_info = { ...parsedData.personal_info, email: finalEmail };

  // 이력서 유효성: 이메일이 없으면 이력서가 아닐 가능성이 높다고 판단.
  // 저장은 그대로 진행하되, is_valid_resume = false 로 기록해 구분할 수 있게 한다.
  const isValidResume = !!finalEmail;

  const gradeFromFile = extractGradeFromFilename(filename);
  if (gradeFromFile) parsedData.file_grade = gradeFromFile;

  const jobCategory = parsedData.professional_summary?.job_category || "직무미상";

  // 4. 임베딩
  process.stdout.write("  [3/4] 임베딩 생성... ");
  const vector = await getEmbedding(buildEmbeddingText(parsedData));
  console.log(`완료 (${Array.isArray(vector) ? vector.length : "?"}차원)`);

  return { parsedData, originalName, jobCategory, vector, isValidResume };
};

const insertResume = async ({ parsedData, originalName, jobCategory, vector, isValidResume }) => {
  const { data, error } = await supabase
    .from("resumes")
    .insert([
      {
        name: originalName,
        job_category: jobCategory,
        total_experience_months: parsedData.professional_summary?.total_experience_months || 0,
        embedding: vector,
        rating: 0,
        is_valid_resume: isValidResume, // 이메일 존재 여부로 판단한 이력서 유효성
        ...resumeDataToColumns(parsedData), // 평문 컬럼/JSONB 분해 (암호화 없음)
      },
    ])
    .select();

  if (error) throw new Error(error.message);
  return data?.[0];
};

// 처리한 파일을 같은 폴더의 하위 폴더(_done/ 또는 _skipped/)로 이동 (이름 충돌 시 타임스탬프 접미사)
const moveToFolder = (filePath, folderName) => {
  const destDir = path.join(path.dirname(filePath), folderName);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  let dest = path.join(destDir, `${base}${ext}`);
  if (fs.existsSync(dest)) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    dest = path.join(destDir, `${base}_${ts}${ext}`);
  }
  fs.renameSync(filePath, dest);
  return dest;
};
// 성공 → _done/, 인터뷰 문서 등 제외 → _skipped/ (재실행 시 재처리 방지)
const moveToDone = (filePath) => moveToFolder(filePath, "_done");
const moveToSkipped = (filePath) => moveToFolder(filePath, "_skipped");

// ════════════════════════════════════════════════════════════════════════════
//  메인
// ════════════════════════════════════════════════════════════════════════════
const collectFiles = () => {
  if (specificFile) {
    const fp = path.isAbsolute(specificFile) ? specificFile : path.resolve(specificFile);
    if (!fs.existsSync(fp)) { console.error(`❌ 파일을 찾을 수 없습니다: ${fp}`); process.exit(1); }
    return [fp];
  }

  if (!fs.existsSync(TARGET_DIR)) {
    // 기본 폴더가 없으면 만들어 주고 안내 (오류 아님)
    fs.mkdirSync(TARGET_DIR, { recursive: true });
    console.log(`\n📁 폴더를 새로 만들었습니다: ${TARGET_DIR}`);
    console.log(`   이 폴더에 이력서 파일(pdf/docx/doc/txt)을 넣고 다시 실행하세요.\n`);
    process.exit(0);
  }

  // 최상위 파일만 (하위 _done/ 등 폴더, 안내용 README 는 제외)
  return fs.readdirSync(TARGET_DIR)
    .filter((f) => !/^readme/i.test(f))
    .map((f) => path.join(TARGET_DIR, f))
    .filter((fp) => fs.statSync(fp).isFile() && SUPPORTED.includes(path.extname(fp).toLowerCase()));
};

const main = async () => {
  console.log(`\n🗂️  이력서 일괄 DB 등록`);
  console.log(`   Ollama : ${OLLAMA_URL}  (text=${TEXT_MODEL}, embed=${EMBEDDING_MODEL})`);
  console.log(`   Supabase: ${SUPABASE_URL}`);
  console.log(specificFile ? `   대상 파일: ${path.resolve(specificFile)}` : `   대상 폴더: ${TARGET_DIR}`);
  console.log(`   모드   : ${dryRun ? "DRY-RUN (DB 저장·이동 안 함)" : noMove ? "저장만 (이동 안 함)" : "저장 후 _done/ 이동"}`);

  const files = collectFiles();
  if (files.length === 0) {
    console.log(`\n처리할 파일이 없습니다. (지원 형식: ${SUPPORTED.join(", ")})\n`);
    return;
  }

  console.log(`\n총 ${files.length}개 파일 처리 시작\n${"═".repeat(60)}`);

  const results = [];
  // VRAM 경합을 피하려 파일은 순차 처리 (파일 1개 내부의 프로젝트 청크만 병렬)
  for (let i = 0; i < files.length; i++) {
    const fp = files[i];
    const filename = path.basename(fp);
    console.log(`\n[${i + 1}/${files.length}] 📄 ${filename}`);
    try {
      const parsed = await parseResumeFile(fp);

      // 이력서가 아닌 인터뷰 문서 → 저장하지 않고 제외 (_skipped/ 이동)
      if (parsed.skipped) {
        let movedTo = null;
        if (!dryRun && !noMove) movedTo = moveToSkipped(fp);
        console.log(`  ⏭️  제외: ${parsed.reason}${movedTo ? `  → _skipped/${path.basename(movedTo)}` : ""}`);
        results.push({ file: filename, status: "skip", reason: parsed.reason });
        continue;
      }

      if (dryRun) {
        const d = parsed.parsedData;
        console.log(`  [4/4] DRY-RUN — 저장 생략  [model=${TEXT_MODEL}]`);
        console.log(`  → 이름:${parsed.originalName}  직군:${parsed.jobCategory}  경력:${d.professional_summary?.total_experience_months || 0}개월  유효:${parsed.isValidResume ? "✅" : "⚠️ 이메일없음"}`);
        console.log(`     학력:${(d.educations || d.education || []).length}  경력:${(d.work_experiences || []).length}  기술:${(d.skills || []).length}  프로젝트:${(d.projects || []).length}  자격:${(d.certifications || []).length}  어학:${(d.languages || []).length}`);
        results.push({ file: filename, status: "dry", name: parsed.originalName });
        continue;
      }

      process.stdout.write("  [4/4] DB 저장... ");
      const row = await insertResume(parsed);
      console.log(`완료 (id=${row?.id ?? "?"})`);

      let movedTo = null;
      if (!noMove) movedTo = moveToDone(fp);

      const validTag = parsed.isValidResume ? "" : "  ⚠️ is_valid_resume=false(이메일없음)";
      console.log(`  ✅ 등록: ${parsed.originalName} (${parsed.jobCategory})${validTag}${movedTo ? `  → _done/${path.basename(movedTo)}` : ""}`);
      results.push({ file: filename, status: "ok", name: parsed.originalName, id: row?.id });
    } catch (e) {
      console.error(`  ❌ 실패: ${e.message}`);
      results.push({ file: filename, status: "fail", error: e.message });
    }
  }

  // 요약
  const ok = results.filter((r) => r.status === "ok");
  const dry = results.filter((r) => r.status === "dry");
  const fail = results.filter((r) => r.status === "fail");
  const skip = results.filter((r) => r.status === "skip");

  console.log(`\n${"═".repeat(60)}`);
  console.log(`📊 결과 요약  —  성공 ${ok.length} / 실패 ${fail.length}${skip.length ? ` / 제외 ${skip.length}` : ""}${dry.length ? ` / dry-run ${dry.length}` : ""}  (총 ${results.length})`);
  if (skip.length) {
    console.log(`\n제외 목록(이력서 아님):`);
    skip.forEach((r) => console.log(`  ⏭️  ${r.file}  →  ${r.reason}`));
  }
  if (fail.length) {
    console.log(`\n실패 목록:`);
    fail.forEach((r) => console.log(`  ❌ ${r.file}  →  ${r.error}`));
    console.log(`\n  (실패한 파일은 폴더에 그대로 남아 있어 수정 후 재실행하면 다시 처리됩니다)`);
  }
  console.log("");

  // 실패가 하나라도 있으면 비정상 종료 코드로 알림 (.bat 에서 감지)
  process.exit(fail.length > 0 ? 1 : 0);
};

main().catch((e) => {
  console.error("\n실행 오류:", e);
  process.exit(1);
});
