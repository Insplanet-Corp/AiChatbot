// 이력서 파싱 공용 순수 로직.
// 브라우저(src/services/resumeService.ts, src/utils/fileParser.ts)와
// Node 스크립트(scripts/testParseLocal.mjs, scripts/seedResumesToDB.mjs, scripts/diagnoseExtraction.mjs)
// 양쪽에서 이 파일 하나를 그대로 import 한다 (Node 는 .ts 확장자를 붙여 상대경로로 직접 import,
// 네이티브 TS 스트리핑으로 실행됨 — enum/namespace 등 비삭제형 문법은 쓰지 않는다).
// I/O·LLM 호출·환경변수 등 실행 환경에 따라 달라지는 코드는 포함하지 않는다.
import { CANDIDATE_GRADES, type CandidateGrade, type JobCategory } from "../constants/service.ts";
import type { ResumeData, ResumeProject } from "../types/resume.ts";

// ── 배열 유틸 ──────────────────────────────────────────────────────────────
// 배열을 매핑 후 구분자로 연결. 배열이 아니면 빈 문자열 반환.
export const mapJoin = <T>(
  arr: T[] | undefined,
  fn: (item: T) => string,
  sep: string,
): string => (Array.isArray(arr) ? arr.map(fn).join(sep) : "");

// ── LLM 응답 → JSON 복구 ────────────────────────────────────────────────────
/**
 * LLM 응답에서 JSON 부분만 추출.
 * 배열 응답([...])과 객체 응답({...}) 모두 처리.
 * 마크다운 펜스나 설명 텍스트는 첫/마지막 괄호 기준으로 자동 제거.
 */
export const extractJsonText = (raw: string): string => {
  const objStart = raw.indexOf("{");
  const arrStart = raw.indexOf("[");

  const isArray = arrStart !== -1 && (objStart === -1 || arrStart < objStart);

  if (isArray) {
    const end = raw.lastIndexOf("]");
    if (arrStart === -1 || end === -1) throw new Error("JSON 배열을 찾을 수 없습니다.");
    return raw.substring(arrStart, end + 1);
  } else {
    const end = raw.lastIndexOf("}");
    if (objStart === -1 || end === -1) throw new Error("JSON 객체를 찾을 수 없습니다.");
    return raw.substring(objStart, end + 1);
  }
};

// 잘린 JSON을 복구: 잘못된 이스케이프를 교정하고, 열린 bracket/brace를 역순으로 닫아줌
export const repairTruncatedJson = (raw: string): string => {
  let text = extractJsonText(raw);

  try {
    JSON.parse(text);
    return text;
  } catch {}

  // LLM이 출력한 JSON 미허용 이스케이프(예: "\W", "\한")를 리터럴 백슬래시로 교정
  text = text.replace(/\\(?!["\\/bfnrtu]|u[0-9a-fA-F]{4})/g, "\\\\");
  try {
    JSON.parse(text);
    return text;
  } catch {}

  const stack: string[] = [];
  const pairs: Record<string, string> = { "{": "}", "[": "]" };
  let inString = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prev = text[i - 1];
    if (inString) {
      if (ch === '"' && prev !== "\\") inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }

  const trimmed = text.trimEnd().replace(/,\s*$/, "");
  const closing = stack.reverse().map((c) => pairs[c]).join("");
  const repaired = trimmed + closing;

  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    throw new Error("JSON 복구에 실패했습니다.");
  }
};

// LLM이 출력한 "undefined" 문자열 값을 빈 문자열로 정리
export const sanitizeUndefined = (obj: any): any => {
  if (Array.isArray(obj)) return obj.map(sanitizeUndefined);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, sanitizeUndefined(v)]),
    );
  }
  if (typeof obj === "string" && obj.trim().toLowerCase() === "undefined")
    return "";
  return obj;
};

// 프로젝트명 기준 중복 제거
export const deduplicateProjects = (projects: ResumeProject[]): ResumeProject[] => {
  const seen = new Set<string>();
  return projects.filter((p) => {
    const key = (p.project_name || "").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// ── 이력서 텍스트 분리 ────────────────────────────────────────────────────
// 프로젝트/수상경력 섹션이 시작되는 지점을 찾는 패턴.
export const PROJECT_SECTION_PATTERN =
  /(?:수상경력|프로젝트\s*수행\s*경력|프로젝트\s*이력|수행\s*경력|PROJECT)/i;

// 알려진 섹션 헤더로 텍스트를 base(기본정보/경력/학력/기술) / 프로젝트 청크로 분리
export const splitResumeIntoSections = (
  text: string,
): { base: string; projectChunks: string[] } => {
  const projectSectionMatch = text.search(PROJECT_SECTION_PATTERN);

  if (projectSectionMatch === -1) {
    return { base: text, projectChunks: [] };
  }

  const baseText = text.substring(0, projectSectionMatch).trim();
  const projectText = text.substring(projectSectionMatch).trim();

  // 프로젝트 섹션을 줄 단위로 나눠서 날짜 패턴 기준으로 각 항목 분리
  const lines = projectText.split("\n").filter((l) => l.trim());
  const projectEntries: string[] = [];
  let currentEntry = "";

  for (const line of lines) {
    // 날짜 "범위 시작"(~ 포함)으로만 새 항목을 감지 (예: "2024.01 ~").
    // 좌표 재구성된 표에서 셀이 줄바꿈되면 "2024.09 | 스템 개편"처럼 종료일만 있는
    // 이어짐 줄이 생기는데, 단순 날짜 패턴이면 이를 새 항목으로 오인해 프로젝트가 쪼개진다.
    const isNewEntry =
      /^\s*(\d{4}[.\-]\d{1,2}\s*[~∼]|\d{4}년)/.test(line) ||
      /^\s*undefined/.test(line);
    if (isNewEntry && currentEntry.trim()) {
      projectEntries.push(currentEntry.trim());
      currentEntry = line;
    } else {
      currentEntry += (currentEntry ? "\n" : "") + line;
    }
  }
  if (currentEntry.trim()) projectEntries.push(currentEntry.trim());

  // 프로젝트 항목들을 3개 청크로 균등 분할
  const chunkSize = Math.ceil(projectEntries.length / 3);
  const projectChunks: string[] = [];
  for (let i = 0; i < projectEntries.length; i += chunkSize) {
    const chunk = projectEntries.slice(i, i + chunkSize).join("\n");
    if (chunk.trim()) projectChunks.push(chunk);
  }

  return { base: baseText, projectChunks };
};

// ── PDF 좌표 기반 텍스트 재구성 ─────────────────────────────────────────────
// PDF 텍스트 아이템을 좌표 기반으로 마크다운형 구조로 재구성.
// (기존 join(" ") 방식은 페이지 전체를 한 줄로 뭉개 줄/표 구조가 사라졌고,
//  프롬프트의 "라벨 다음 줄 값·헤더 다음 줄 행" 규칙이 동작할 수 없었다)
// - 같은 Y 좌표(±글자높이 절반)의 아이템 → 한 줄로 묶음
// - 줄 안에서 글자높이 1.5배 이상 수평 간격 → 표의 열 경계로 보고 " | " 삽입
// - 셀 텍스트가 줄바꿈된 표 행(열 x좌표가 이전 행과 정렬 + 수직 간격 좁음) → 셀 단위 병합
// - 줄 사이 수직 간격이 글자높이 2.2배 이상 → 문단/섹션 경계로 보고 빈 줄 삽입
export const reconstructPdfPageText = (textContent: { items: any[] }): string => {
  type Positioned = { str: string; x: number; y: number; w: number; h: number };
  type Cell = { x: number; end: number; text: string };
  const items: Positioned[] = textContent.items
    .filter((it: any) => it.str && it.str.trim())
    .map((it: any) => ({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5],
      w: it.width,
      h: it.height || Math.abs(it.transform[3]) || 10,
    }));
  if (items.length === 0) return "";

  // 위→아래(y 내림차순 — PDF 좌표는 아래가 원점), 왼→오 정렬 후 같은 높이끼리 줄로 묶음
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Positioned[][] = [[items[0]]];
  for (let i = 1; i < items.length; i++) {
    const item = items[i];
    const line = lines[lines.length - 1];
    if (Math.abs(line[0].y - item.y) <= Math.max(item.h, line[0].h) * 0.5) {
      line.push(item);
    } else {
      lines.push([item]);
    }
  }

  const avgH = items.reduce((sum, it) => sum + it.h, 0) / items.length;

  // 각 줄을 셀 목록으로 변환 (수평 간격 1.5배 이상 = 열 경계)
  const rows = lines.map((line) => {
    line.sort((a, b) => a.x - b.x);
    const cells: Cell[] = [];
    let cur: Cell | null = null;
    for (const it of line) {
      if (cur && it.x - cur.end <= avgH * 1.5) {
        const gap = it.x - cur.end;
        const needSpace =
          gap > avgH * 0.15 && !cur.text.endsWith(" ") && !it.str.startsWith(" ");
        cur.text += (needSpace ? " " : "") + it.str;
        cur.end = it.x + it.w;
      } else {
        cur = { x: it.x, end: it.x + it.w, text: it.str };
        cells.push(cur);
      }
    }
    return { y: line[0].y, cells };
  });

  // 한글/한자 경계에서 줄바꿈된 단어는 공백 없이 이어붙임 ("포인트 적립 시"+"스템 개편")
  const joinWrapped = (a: string, b: string): string =>
    /[가-힣一-龥]$/.test(a) && /^[가-힣一-龥]/.test(b) ? a + b : `${a} ${b}`;

  // 줄바꿈된 표 행 병합. 두 가지 신호를 본다:
  // (a) 같은 행 안에서 세로 중앙정렬로 갈라진 줄 — 간격이 글자높이보다 훨씬 좁다(0.8배 미만).
  //     일반 본문 줄 간격은 최소 1em 이상이므로 이 간격은 같은 표 행에서만 나온다.
  // (b) 셀 텍스트 줄바꿈 — 줄 간격 수준(1.9배 미만)이고 모든 셀 x가 이전 행 셀과 정렬.
  const merged: typeof rows = [];
  for (const row of rows) {
    const prev = merged[merged.length - 1];
    const gap = prev !== undefined ? prev.y - row.y : Infinity;
    const sameRow = prev !== undefined && prev.cells.length >= 2 && gap < avgH * 0.8;
    const wrappedLine =
      prev !== undefined &&
      prev.cells.length >= 3 &&
      row.cells.length >= 2 &&
      row.cells.length <= prev.cells.length &&
      gap < avgH * 1.9 &&
      row.cells.every((c) => prev.cells.some((pc) => Math.abs(pc.x - c.x) < avgH));
    if (sameRow || wrappedLine) {
      for (const c of row.cells) {
        const target = prev!.cells.find((pc) => Math.abs(pc.x - c.x) < avgH);
        if (target) {
          target.text = joinWrapped(target.text, c.text);
        } else {
          prev!.cells.push({ ...c }); // 새 열 위치면 x 순서에 맞게 셀로 삽입
          prev!.cells.sort((a, b) => a.x - b.x);
        }
      }
      prev!.y = row.y; // 3줄 이상 이어지는 행도 연속 병합되도록 기준 y 갱신
    } else {
      merged.push(row);
    }
  }

  let out = "";
  let prevY: number | null = null;
  for (const row of merged) {
    if (prevY !== null && prevY - row.y > avgH * 2.2) out += "\n";
    out += row.cells.map((c) => c.text.trim()).join(" | ") + "\n";
    prevY = row.y;
  }
  return out.trim();
};

// ── 임베딩용 평문 조립 ───────────────────────────────────────────────────
// 파싱 결과를 임베딩용 평문 텍스트로 조립 (직군/직무/기술/역량/프로젝트/경력)
export const buildEmbeddingText = (parsedData: ResumeData): string => {
  const jobCategory = parsedData.professional_summary?.job_category || "직무미상";
  const currentRole = parsedData.professional_summary?.current_role || "";

  const skillString = mapJoin(
    parsedData.skills,
    (s) => (typeof s === "string" ? s : s.skill_name || ""),
    ", ",
  );

  const competencyString = mapJoin(
    parsedData.professional_summary?.core_competencies,
    (c) => c,
    " ",
  );

  const projectString = mapJoin(
    parsedData.projects,
    (p) => {
      const techStr = Array.isArray(p.tech_stack) ? p.tech_stack.join(", ") : "";
      const outcomeStr = p.outcomes || "";
      return [p.project_name, techStr, outcomeStr].filter(Boolean).join(" | ");
    },
    "\n",
  );

  const workTechString = mapJoin(
    parsedData.work_experiences,
    (w) => {
      const techStr = Array.isArray(w.tech_stack) ? w.tech_stack.join(", ") : "";
      const achieveStr = Array.isArray(w.key_achievements) ? w.key_achievements.join(". ") : "";
      return [w.company_name, w.job_title, techStr, achieveStr].filter(Boolean).join(" | ");
    },
    "\n",
  );

  return `직군: ${jobCategory}\n직무: ${currentRole}\n기술스택: ${skillString}\n핵심역량: ${competencyString}\n주요프로젝트:\n${projectString}\n경력상세:\n${workTechString}`.trim();
};

// ── 파일명 기반 보강 추출 ────────────────────────────────────────────────
// 파일명에서 이름 추출 시 제거할 이력서 관련 키워드 (한글 토큰 오인 방지)
export const FILENAME_STOPWORDS = [
  "경력기술서", "자기소개서", "재직증명서", "경력증명서",
  "포트폴리오", "지원서", "이력서", "자소서", "경력", "이력",
  "국문", "영문", "최종", "수정", "사본", "제출", "양식",
  // 직군/문서 태그 (예: "프로필_웹기획_강재희.pdf" 에서 "웹기획"이 이름으로 오인되는 것 방지)
  "프로필", "웹기획", "웹디자인", "웹퍼블리싱", "퍼블리셔",
  "디자이너", "개발자", "기획자",
  "resume", "portfolio", "profile", "cv",
];

/**
 * 파일명에서 등급 태그(초급/중급/고급/특급)를 찾는다. 찾지 못하면 null.
 */
export const extractGradeFromFilename = (filename: string): CandidateGrade | null => {
  const base = filename.replace(/\.[^.]+$/, "");
  return CANDIDATE_GRADES.find((g) => base.includes(g)) ?? null;
};

// 파일명의 직군 태그를 4개 표준 카테고리로 매핑. (에이전시가 "(퍼블)홍길동__..." 처럼 명시)
// 선두 괄호 "(...)" 안 또는 "__" 앞부분(태그 영역)만 검사해 본문/회사명 오인을 막는다.
export const CATEGORY_FILENAME_PATTERNS: Array<[JobCategory, RegExp]> = [
  ["퍼블리싱", /퍼블|publish|마크업|markup/i],
  ["개발", /개발|프론트\s*엔드|백\s*엔드|풀스택|frontend|backend|develop|engineer|프로그래/i],
  ["디자인", /디자인|UI\/?UX|UX|그래픽|design/i],
  ["기획", /기획|제안|PM|PO/i],
];
export const extractCategoryFromFilename = (filename: string): JobCategory | null => {
  const base = filename.replace(/\.[^.]+$/, "");
  const paren = base.match(/^\s*\(([^)]+)\)/);
  // 태그 영역: 선두 괄호 "(...)" 안, 없으면 "__" 앞부분.
  // 내부 괄호 주석(출처/메모: "(출처_디자인그룹나인)" 등)은 제거해 회사명 오인을 막는다.
  const head = (paren ? paren[1] : base.split("__")[0]).replace(/\([^)]*\)/g, " ");
  // 여러 태그가 섞이면(예: "기획,디자인") 가장 앞에 적힌(=주(主)) 직군을 택한다.
  let best: JobCategory | null = null;
  let bestIdx = Infinity;
  for (const [canon, re] of CATEGORY_FILENAME_PATTERNS) {
    const m = head.match(re);
    if (m && m.index !== undefined && m.index < bestIdx) {
      bestIdx = m.index;
      best = canon;
    }
  }
  return best;
};

/**
 * 파일명에서 한글 이름을 추출. 찾지 못하면 null.
 * 확장자·이력서 키워드·숫자·특수문자를 제거한 뒤 남은 한글 2~5자 토큰을 이름으로 본다.
 * 예) "홍길동_이력서.pdf" → "홍길동", "[이력서]김철수_2024.docx" → "김철수"
 */
export const extractNameFromFilename = (filename: string): string | null => {
  let base = filename.replace(/\.[^.]+$/, ""); // 확장자 제거
  for (const word of FILENAME_STOPWORDS) {
    base = base.replace(new RegExp(word, "gi"), " ");
  }
  const token = base
    .replace(/[^가-힣]+/g, " ") // 한글 외 문자는 구분자(공백)로 치환
    .trim()
    .split(/\s+/)
    .find((t) => t.length >= 2 && t.length <= 5);
  return token || null;
};

// ── 본문 기반 이메일/전화 보강 추출 ─────────────────────────────────────────
// 이메일 정규식: 로컬파트@도메인.TLD(2자 이상). .com / .co.kr / .net 등 모두 매칭.
export const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/**
 * 이력서 평문에서 이메일을 추출. 찾지 못하면 null.
 * LLM이 이메일을 누락하더라도 텍스트에 이메일 형식이 있으면 반드시 저장하기 위한 폴백.
 * PDF 추출 시 "hong @ example. com" 처럼 @·. 주변에 공백이 끼는 경우까지 보정해 재시도한다.
 */
export const extractEmailFromText = (text: string): string | null => {
  if (!text) return null;
  const direct = text.match(EMAIL_REGEX);
  if (direct) return direct[0];
  // @ · . 주변 공백 제거 후 재시도 (PDF 텍스트 추출 시 토큰이 분리되는 케이스)
  const despaced = text.replace(/\s*([@.])\s*/g, "$1");
  return despaced.match(EMAIL_REGEX)?.[0] ?? null;
};

// 휴대폰 정규식: 01X-XXXX-XXXX (구분자 하이픈/점/공백 허용, 국가코드 +82 선택).
export const PHONE_REGEX = /(?:\+?82[-.\s]?)?0?1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/;

/**
 * 이력서 평문에서 휴대폰 번호를 추출. 찾지 못하면 null.
 * LLM 이 전화번호를 누락하더라도 텍스트에 번호 형식이 있으면 저장하기 위한 폴백(이메일과 대칭).
 * 1) 휴대폰 패턴 직접 매칭 → 2) "연락처/휴대폰/HP" 라벨 뒤 숫자열(구분자 깨진 PDF 대비).
 */
export const extractPhoneFromText = (text?: string): string | null => {
  if (!text) return null;
  const direct = text.match(PHONE_REGEX)?.[0];
  if (direct) return direct;
  const labeled = text.match(
    /(?:연락처|휴대폰|핸드폰|전화|mobile|tel|h\.?p)[^\d]{0,6}((?:\d[\s.\-]?){9,13})/i,
  );
  return labeled?.[1] ?? null;
};

// ── few-shot 예시 값 필터링 ──────────────────────────────────────────────
// 프롬프트 few-shot 예시에 등장하는 더미 이름 — LLM 이 그대로 베껴오면 무효로 본다.
export const EXAMPLE_NAMES = new Set(["홍길동", "김도현", "박지은"]);

// 프롬프트 few-shot 예시의 프로젝트/회사/학교 — LLM 이 베껴온 항목은 제거한다(이름 가드와 대칭).
export const EXAMPLE_PROJECT_NAMES = new Set([
  "카카오페이 결제 모듈 고도화",
  "사내 모니터링 대시보드 구축",
  "삼성 브랜드 리뉴얼",
]);
export const EXAMPLE_COMPANY_NAMES = new Set(["카카오(주)", "스타트업A", "디자인컴퍼니"]);
export const EXAMPLE_SCHOOL_NAMES = new Set(["한국대학교"]);

export const stripExampleEntries = (data: ResumeData): void => {
  if (Array.isArray(data.projects))
    data.projects = data.projects.filter(
      (p) => !EXAMPLE_PROJECT_NAMES.has((p.project_name || "").trim()),
    );
  if (Array.isArray(data.work_experiences))
    data.work_experiences = data.work_experiences.filter(
      (w) => !EXAMPLE_COMPANY_NAMES.has((w.company_name || "").trim()),
    );
  if (Array.isArray(data.educations))
    data.educations = data.educations.filter(
      (e) => !EXAMPLE_SCHOOL_NAMES.has((e.school_name || "").trim()),
    );
};

// ── 인터뷰 문서 판별 ───────────────────────────────────────────────────────
// 이력서가 아닌 인터뷰 문서(인터뷰 질의서/전화 인터뷰 등)를 저장 대상에서 제외하기 위한 키워드.
// 공백을 제거(despace)한 형태로 비교하므로 "전화 인터뷰" / "전화인터뷰" 띄어쓰기 차이를 무시한다.
//
// 파일명용: 파일은 의도적으로 명명되므로 "전화인터뷰" 같은 단독 키워드도 넓게 매칭.
export const INTERVIEW_FILENAME_KEYWORDS = [
  "인터뷰질의서", "인터뷰질문지", "인터뷰질문서", "인터뷰시트",
  "전화인터뷰", "전화면접", "면접질의서", "면접질문지",
];
// 본문용: '질의서/질문지/질문서/시트' 등 문서 유형어를 포함한 형태만.
// (실제 이력서 본문의 "전화 인터뷰 진행" 같은 업무 설명과의 충돌을 막기 위함)
export const INTERVIEW_CONTENT_KEYWORDS = [
  "인터뷰질의서", "인터뷰질문지", "인터뷰질문서", "인터뷰시트",
  "면접질의서", "면접질문지",
];

const stripSpaces = (s: string): string => s.replace(/\s+/g, "");

/**
 * 이력서가 아닌 인터뷰 관련 문서(인터뷰 질의서/전화 인터뷰 등)인지 판별.
 * - 파일명: 단독 키워드까지 넓게 검사.
 * - 본문: 상단(제목 영역)만, 문서 유형어를 포함한 키워드로 검사 → 본문 업무 설명 오(誤)제외 방지.
 */
export const isInterviewDocument = (filename: string, text: string): boolean => {
  const nameKey = stripSpaces(filename);
  if (INTERVIEW_FILENAME_KEYWORDS.some((k) => nameKey.includes(k))) return true;
  const titleKey = stripSpaces(text.slice(0, 300)); // 본문 상단(제목) 영역만 검사
  return INTERVIEW_CONTENT_KEYWORDS.some((k) => titleKey.includes(k));
};
