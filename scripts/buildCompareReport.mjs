#!/usr/bin/env node
/**
 * 이력서 파싱 비교 리포트 생성기
 *
 * test-resumes/ 의 각 원본 PDF에서 "AI가 받는 재구성 텍스트"를 다시 뽑고,
 * test-results/ 의 최신 파싱 결과 JSON과 좌우로 나란히 붙여
 * test-results/_report.html 하나로 만든다. (브라우저로 열어 직접 비교)
 *
 * 사용법: node scripts/buildCompareReport.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RESUMES_DIR = path.join(ROOT, "test-resumes");
const RESULTS_DIR = path.join(ROOT, "test-results");
const OUT = path.join(RESULTS_DIR, "_report.html");

// ── PDF 텍스트 재구성 (src/utils/fileParser.ts 의 reconstructPdfPageText 동기화) ──
let pdfjs;
const loadPdfjs = async () => {
  if (pdfjs) return;
  pdfjs = await import(pathToFileURL(path.join(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.mjs")).href);
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    path.join(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
  ).href;
};

const reconstructPdfPageText = (textContent) => {
  const items = textContent.items
    .filter((it) => it.str && it.str.trim())
    .map((it) => ({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5],
      w: it.width,
      h: it.height || Math.abs(it.transform[3]) || 10,
    }));
  if (items.length === 0) return "";

  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [[items[0]]];
  for (let i = 1; i < items.length; i++) {
    const item = items[i];
    const line = lines[lines.length - 1];
    if (Math.abs(line[0].y - item.y) <= Math.max(item.h, line[0].h) * 0.5) line.push(item);
    else lines.push([item]);
  }

  const avgH = items.reduce((s, it) => s + it.h, 0) / items.length;

  const rows = lines.map((line) => {
    line.sort((a, b) => a.x - b.x);
    const cells = [];
    let cur = null;
    for (const it of line) {
      if (cur && it.x - cur.end <= avgH * 1.5) {
        const gap = it.x - cur.end;
        const needSpace = gap > avgH * 0.15 && !cur.text.endsWith(" ") && !it.str.startsWith(" ");
        cur.text += (needSpace ? " " : "") + it.str;
        cur.end = it.x + it.w;
      } else {
        cur = { x: it.x, end: it.x + it.w, text: it.str };
        cells.push(cur);
      }
    }
    return { y: line[0].y, cells };
  });

  const joinWrapped = (a, b) => (/[가-힣一-龥]$/.test(a) && /^[가-힣一-龥]/.test(b) ? a + b : `${a} ${b}`);

  const merged = [];
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
        const target = prev.cells.find((pc) => Math.abs(pc.x - c.x) < avgH);
        if (target) target.text = joinWrapped(target.text, c.text);
        else { prev.cells.push({ ...c }); prev.cells.sort((a, b) => a.x - b.x); }
      }
      prev.y = row.y;
    } else {
      merged.push(row);
    }
  }

  let out = "";
  let prevY = null;
  for (const row of merged) {
    if (prevY !== null && prevY - row.y > avgH * 2.2) out += "\n";
    out += row.cells.map((c) => c.text.trim()).join(" | ") + "\n";
    prevY = row.y;
  }
  return out.trim();
};

const extractPdfText = async (filePath) => {
  await loadPdfjs();
  const data = new Uint8Array(fs.readFileSync(filePath));
  const pdf = await pdfjs.getDocument({ data }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    text += reconstructPdfPageText(await (await pdf.getPage(i)).getTextContent()) + "\n\n";
  }
  return text.trim();
};

// ── DOCX/DOC/TXT 텍스트 추출 (testParseLocal.mjs 라우터 동기화) ────────────────
const extractDocxText = async (filePath) => {
  const mammoth = await import("mammoth");
  const result = await mammoth.default.extractRawText({ buffer: fs.readFileSync(filePath) });
  return result.value.trim();
};

const extractText = async (filePath) => {
  const ext = path.extname(filePath).toLowerCase().slice(1);
  switch (ext) {
    case "pdf": return extractPdfText(filePath);
    case "docx":
    case "doc": return extractDocxText(filePath);
    case "txt": return fs.readFileSync(filePath, "utf-8").trim();
    default: throw new Error(`지원하지 않는 형식: .${ext}`);
  }
};

// ── 파일별 최신 결과 JSON 찾기 ────────────────────────────────────────────────
const latestResultFor = (pdfName) => {
  const base = pdfName.replace(/[^\w가-힣.-]/g, "_");
  const matches = fs
    .readdirSync(RESULTS_DIR)
    .filter((f) => f.endsWith(".json") && f.includes(base.replace(/\.[^.]+$/, "")))
    .sort()
    .reverse();
  return matches[0] ? JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, matches[0]), "utf8")) : null;
};

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── 파싱 결과를 사람이 읽기 쉬운 HTML 로 ──────────────────────────────────────
const renderParsed = (p) => {
  const pi = p.personal_info || {};
  const ps = p.professional_summary || {};
  const field = (label, val) => `<tr><th>${label}</th><td>${esc(val) || '<span class="empty">—</span>'}</td></tr>`;
  const list = (arr, fn) =>
    Array.isArray(arr) && arr.length
      ? `<ol>${arr.map((x) => `<li>${fn(x)}</li>`).join("")}</ol>`
      : '<span class="empty">— 없음 —</span>';

  return `
    <h4>기본 정보</h4>
    <table class="fields">
      ${field("이름", pi.name)}
      ${field("이메일", pi.email)}
      ${field("전화", pi.phone)}
      ${field("생년월일", pi.birth_date)}
      ${field("성별", pi.gender)}
      ${field("주소", pi.address)}
    </table>
    <h4>요약</h4>
    <table class="fields">
      ${field("직군", ps.job_category)}
      ${field("직무", ps.current_role)}
      ${field("총경력(개월)", ps.total_experience_months)}
      ${field("기술등급", ps.skill_grade)}
      ${field("핵심역량", (ps.core_competencies || []).join(", "))}
    </table>
    <h4>학력</h4>
    ${list(p.educations, (e) => `${esc(e.school_name)} ${esc(e.major)} <small>${esc(e.graduation_status)} ${esc(e.start_date)}~${esc(e.end_date)}</small>`)}
    <h4>경력 (${(p.work_experiences || []).length}건)</h4>
    ${list(p.work_experiences, (w) => `<b>${esc(w.company_name)}</b> ${esc(w.job_title)} <small>${esc(w.start_date)}~${esc(w.end_date)}</small><br><span class="tech">${(w.tech_stack || []).map(esc).join(", ")}</span>`)}
    <h4>프로젝트 (${(p.projects || []).length}건)</h4>
    ${list(p.projects, (x) => `<b>${esc(x.project_name)}</b> <small>${esc(x.client_company)} ${esc(x.start_date)}~${esc(x.end_date)}</small><br><span class="tech">${(x.tech_stack || []).map(esc).join(", ")}</span>`)}
    <h4>기술스택</h4>
    ${list(p.skills, (s) => esc(typeof s === "string" ? s : s.skill_name))}
  `;
};

// ── 메인 ──────────────────────────────────────────────────────────────────────
const main = async () => {
  const SUPPORTED = [".pdf", ".docx", ".doc", ".txt"];
  const files = fs
    .readdirSync(RESUMES_DIR)
    .filter((f) => SUPPORTED.includes(path.extname(f).toLowerCase()))
    .sort();
  const sections = [];

  for (const file of files) {
    process.stdout.write(`처리 중: ${file} ... `);
    let rawText = "";
    try {
      rawText = await extractText(path.join(RESUMES_DIR, file));
    } catch (e) {
      rawText = `(텍스트 추출 실패: ${e.message})`;
    }
    const result = latestResultFor(file);
    const score = result?.meta?.score;
    const badge = !score
      ? '<span class="badge gray">결과없음</span>'
      : `<span class="badge ${score.earned >= 90 ? "green" : score.earned >= 70 ? "yellow" : "red"}">${score.earned}/${score.total}점</span>`;

    sections.push(`
      <section>
        <h2>${esc(file)} ${badge}</h2>
        <div class="cols">
          <div class="col">
            <div class="col-title">📄 AI가 받은 원본 텍스트 (재구성)</div>
            <pre>${esc(rawText || "(비어 있음 — 스캔 PDF는 브라우저 업로드 시 OCR 동작)")}</pre>
          </div>
          <div class="col">
            <div class="col-title">🤖 AI 추출 결과</div>
            <div class="parsed">${result ? renderParsed(result.parsed) : '<p class="empty">파싱 결과 JSON을 찾지 못했습니다.</p>'}</div>
          </div>
        </div>
      </section>
    `);
    console.log("완료");
  }

  const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>이력서 파싱 비교 리포트</title>
<style>
  body { font-family: "Apple SD Gothic Neo", -apple-system, sans-serif; margin: 0; background: #f4f5f7; color: #1a1a1a; }
  header { background: #1a1a2e; color: #fff; padding: 20px 32px; }
  header h1 { margin: 0; font-size: 20px; }
  header p { margin: 6px 0 0; opacity: .7; font-size: 13px; }
  section { background: #fff; margin: 20px; border-radius: 10px; box-shadow: 0 1px 4px rgba(0,0,0,.08); overflow: hidden; }
  section > h2 { margin: 0; padding: 16px 20px; font-size: 16px; border-bottom: 1px solid #eee; background: #fafafa; }
  .cols { display: flex; gap: 0; }
  .col { flex: 1; padding: 16px 20px; min-width: 0; }
  .col:first-child { border-right: 1px solid #eee; background: #fcfcfd; }
  .col-title { font-weight: 700; font-size: 13px; color: #555; margin-bottom: 10px; }
  pre { white-space: pre-wrap; word-break: break-all; font-size: 12px; line-height: 1.55; background: #fff; border: 1px solid #eee; border-radius: 6px; padding: 12px; max-height: 640px; overflow: auto; margin: 0; }
  .parsed h4 { margin: 14px 0 6px; font-size: 13px; color: #2a3f8f; border-bottom: 1px solid #eef; padding-bottom: 3px; }
  .parsed h4:first-child { margin-top: 0; }
  table.fields { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.fields th { text-align: left; width: 90px; color: #666; font-weight: 500; padding: 3px 8px 3px 0; vertical-align: top; }
  table.fields td { padding: 3px 0; }
  ol { margin: 4px 0; padding-left: 20px; font-size: 13px; }
  ol li { margin-bottom: 5px; line-height: 1.5; }
  small { color: #888; }
  .tech { color: #0a7d3c; font-size: 12px; }
  .empty { color: #bbb; }
  .badge { font-size: 12px; padding: 2px 10px; border-radius: 12px; color: #fff; vertical-align: middle; margin-left: 6px; }
  .badge.green { background: #16a34a; } .badge.yellow { background: #d97706; }
  .badge.red { background: #dc2626; } .badge.gray { background: #999; }
</style></head><body>
<header>
  <h1>이력서 파싱 비교 리포트</h1>
  <p>왼쪽: AI가 실제로 받는 재구성 텍스트 · 오른쪽: AI가 뽑아낸 구조화 결과 · 생성: ${new Date().toLocaleString("ko-KR")}</p>
</header>
${sections.join("")}
</body></html>`;

  fs.writeFileSync(OUT, html, "utf8");
  console.log(`\n✅ 리포트 생성: ${path.relative(ROOT, OUT)}`);
};

main().catch((e) => { console.error(e); process.exit(1); });
