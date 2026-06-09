#!/usr/bin/env node
/**
 * 추출 진단: 문서 구조(섹션 헤더 위치)와 splitResumeIntoSections 가 어디서 자르는지 분석.
 * LLM 호출 없음(빠름). 학력/자격/어학이 split 뒤쪽(tail)으로 잘려 누락되는지 확인용.
 *
 *   node scripts/diagnoseExtraction.mjs --file "<경로.docx>"
 */
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"), "..");
const getArg = (n) => { const a = process.argv.slice(2); const i = a.indexOf(n); return i !== -1 ? a[i + 1] : undefined; };
const file = getArg("--file");
if (!file) { console.error("--file <경로> 필요"); process.exit(1); }

const extractDocx = async (fp) => {
  const mammoth = await import("mammoth");
  const r = await mammoth.default.extractRawText({ buffer: fs.readFileSync(fp) });
  return r.value.trim();
};
const extractText = async (fp) => {
  const ext = path.extname(fp).toLowerCase();
  if (ext === ".docx" || ext === ".doc") return extractDocx(fp);
  if (ext === ".txt") return fs.readFileSync(fp, "utf-8");
  throw new Error("이 진단은 docx/txt 만 지원");
};

// 현재 운영 코드와 동일
const splitResumeIntoSections = (text) => {
  const projectSectionPattern = /(?:수상경력|프로젝트\s*수행\s*경력|프로젝트\s*이력|수행\s*경력|PROJECT)/i;
  const matchIdx = text.search(projectSectionPattern);
  if (matchIdx === -1) return { base: text, projectChunks: [], splitIdx: -1 };
  const baseText = text.substring(0, matchIdx).trim();
  return { base: baseText, splitIdx: matchIdx, hasSplit: true };
};

const run = async () => {
  const fp = path.isAbsolute(file) ? file : path.resolve(file);
  const text = await extractText(fp);
  const { splitIdx } = splitResumeIntoSections(text);

  console.log(`\n📄 ${path.basename(fp)}`);
  console.log(`전체 길이: ${text.length}자 / split 지점: ${splitIdx === -1 ? "없음(전체가 base)" : `${splitIdx}자 (${Math.round(splitIdx / text.length * 100)}%)`}`);
  console.log(`→ split 이 있으면, 메인 파서는 0~${splitIdx}자(base)만 보고 그 뒤는 '프로젝트만' 추출함\n`);

  const keywords = ["성명", "이름", "연락처", "휴대폰", "이메일", "E-mail", "생년", "주소",
    "학력", "교육", "최종학교", "졸업", "보유기술", "기술", "스킬", "skill",
    "자격", "certificate", "어학", "language", "경력", "수행", "프로젝트", "수상"];

  console.log("섹션/키워드 위치 (base=split앞, TAIL=split뒤 → 누락 위험):");
  for (const kw of keywords) {
    const idx = text.toLowerCase().indexOf(kw.toLowerCase());
    if (idx === -1) { console.log(`  ${kw.padEnd(10)} : (없음)`); continue; }
    const zone = splitIdx === -1 || idx < splitIdx ? "base" : "⚠️ TAIL";
    const pct = Math.round(idx / text.length * 100);
    console.log(`  ${kw.padEnd(10)} : ${String(idx).padStart(5)}자 (${String(pct).padStart(2)}%)  [${zone}]`);
  }
  console.log("");
  if (process.argv.includes("--dump")) {
    console.log("================ 추출 전문 ================");
    console.log(text);
    console.log("==========================================");
  }
};
run().catch((e) => { console.error("오류:", e.message); process.exit(1); });
