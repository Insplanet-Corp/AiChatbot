#!/usr/bin/env node
// 임시 진단: seedResumesToDB.mjs 의 extractPdfText 와 동일 로직으로
// 텍스트 레이어 추출 결과(빠른 경로 여부)와 본문/섹션 분포를 확인한다. (OCR/Ollama 미실행)
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"), "..");
const file = process.argv[2];
if (!file) { console.error("usage: node _tmp_probe_pdf.mjs <path.pdf>"); process.exit(1); }

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.join(ROOT, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs"),
).href;

const data = new Uint8Array(fs.readFileSync(file));
const pdf = await pdfjs.getDocument({ data }).promise;
let fullText = "";
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const tc = await page.getTextContent();
  fullText += tc.items.map((it) => it.str).join(" ") + "\n";
}
fullText = fullText.trim();

console.log(`\n📄 ${path.basename(file)}`);
console.log(`페이지수: ${pdf.numPages}`);
console.log(`텍스트레이어 길이: ${fullText.length}자`);
console.log(`경로: ${fullText.length >= 100 ? "✅ 빠른 경로(텍스트 그대로 사용)" : "⚠️ OCR 폴백(Tesseract.js, 인터넷 필요)"}`);

// 핵심 필드 정규식 (resumeService.ts 와 동일)
const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE = /(?:\+?82[-.\s]?)?0?1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/;
const despaced = fullText.replace(/\s*([@.])\s*/g, "$1");
console.log(`\n핵심 필드 탐지:`);
console.log(`  이메일: ${fullText.match(EMAIL)?.[0] ?? despaced.match(EMAIL)?.[0] ?? "(없음)"}`);
console.log(`  전화  : ${fullText.match(PHONE)?.[0] ?? "(없음)"}`);

const kws = ["성명","이름","연락처","휴대폰","이메일","E-mail","생년","주소","학력","졸업","보유기술","기술","자격","어학","경력","프로젝트","수행","수상"];
console.log(`\n섹션 키워드:`);
for (const kw of kws) {
  const idx = fullText.toLowerCase().indexOf(kw.toLowerCase());
  console.log(`  ${kw.padEnd(8)} : ${idx === -1 ? "(없음)" : idx + "자"}`);
}

console.log(`\n================ 추출 전문 ================`);
console.log(fullText);
console.log(`==========================================`);
