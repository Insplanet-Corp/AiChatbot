#!/usr/bin/env node
/**
 * resumes-inbox/AA. 인력프로필 의 (중첩) 인력 폴더에서
 * "인력 1명당 이력서/프로필 문서 1개"만 골라 resumes-inbox/ 최상위로 복사한다.
 * (seedResumesToDB.mjs 는 최상위 파일만 스캔하므로 평탄화가 필요)
 *
 *   node scripts/selectResumeFiles.mjs            # 미리보기(복사 안 함)
 *   node scripts/selectResumeFiles.mjs --apply    # 실제 복사
 *
 * 주의: ★★내부인력프로필 등 일부 폴더/파일명은 NFD(맥) 정규화라 매칭 전 NFC 로 변환한다.
 *       (파일시스템 접근에는 readdir 가 준 원본 문자열을 그대로 사용)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const INBOX = path.join(ROOT, "resumes-inbox");
const BASE = path.join(INBOX, "AA. 인력프로필");

const apply = process.argv.includes("--apply");
const nfc = (s) => s.normalize("NFC");
const stripSp = (s) => s.replace(/\s+/g, "");

const SUPPORTED = new Set([".pdf", ".docx", ".doc", ".txt"]);
// 이 폴더들은 통째로 무시 (이력서가 들어있지 않은 자료/증빙류)
const SKIP_DIR = /포트폴리오|portfolio|포폴|화면설계|증빙|급여|신분증|경력증명|해촉|증명서|학교\s*증명/i;
// 비(非)이력서 파일
const EXCLUDE_FILE = /(졸업증명|재직증명|경력증명|해촉증명|증명서|가입내역|국민연금|연금|건강보험|보험|통장|신분증|주민등록|등본|초본|급여|명세|포트폴리오|포폴|portfolio|접종|백신|코로나|정부24|산업기사|정보처리|자격증|수료증|이수증|면허증)/i;
const BACKUP_PATH = /(^|[\\/])(bak|back|old|구버전|이전)([\\/]|$)/i;

const priority = (name) => {
  const s = stripSp(nfc(name));
  if (/이력서|resume|résumé/i.test(s)) return 100;
  if (/경력기술서|기술경력서|경력이력서/.test(s)) return 90;
  if (/프로필|profile|이력카드|인력카드|개인이력/i.test(s)) return 80;
  if (/자기소개서|자소서/.test(s)) return 60;
  if (/(초급|중급|고급|특급)/.test(s)) return 50;
  return 10;
};
const extRank = (ext) => ({ ".pdf": 3, ".docx": 2, ".doc": 1, ".txt": 0 }[ext] ?? 0);
const staleName = (name) => /원본|백업|copy|구버전|이전/i.test(nfc(name));

// 폴더명 → 태그(이름_직군_등급).  괄호 밖 본문에서 직군 우선 추출(괄호 주석 오염 방지)
const NOISE = new Set(["퍼블리싱","퍼블","개발","디자인","기획","제안","관리","사업","운영","마크업","고급","중급","초급","특급","프로필","프리랜서","퇴사","종료","정직원","입사","직원이동","이동","증빙","필요","추천","소개","확인","면담","완료","지원","재택근무","포지션"]);
const jikgunOf = (s) =>
  /퍼블|publish|마크업/i.test(s) ? "퍼블" :
  /개발|frontend|backend|풀스택|develop|engineer|프로그래/i.test(s) ? "개발" :
  /디자인|UX|UI|그래픽|design/i.test(s) ? "디자인" :
  /기획|제안|PM|PO/i.test(s) ? "기획" : "";
const isJikgunGradeToken = (t) =>
  t.replace(/기획|디자인|퍼블리싱|퍼블|개발|운영|마크업|제안|관리|사업|초급|중급|고급|특급/g, "") === "";
const parseFolder = (rawName) => {
  const name0 = nfc(rawName);
  const outsideParens = name0.replace(/\([^)]*\)/g, " ");
  const parens = [...name0.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]).join(" ");
  const grade = (name0.match(/(초급|중급|고급|특급)/) || [])[1] || "";
  const jikgun = jikgunOf(outsideParens) || jikgunOf(parens);
  const tokens = (outsideParens.match(/[가-힣]{2,4}/g) || []);
  const person = tokens.find((t) => !NOISE.has(t) && !isJikgunGradeToken(t)) || "";
  const tag = [person, jikgun, grade].filter(Boolean).join("_")
    || name0.replace(/[\\/:*?"<>|()]/g, "_").slice(0, 30);
  return { tag, person };
};

// person 폴더 하위에서 후보 파일 재귀 수집 (SKIP_DIR 폴더 제외, bak 등은 포함하되 감점)
const gather = (dir) => {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = nfc(ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIR.test(name)) continue;
      out.push(...gather(path.join(dir, ent.name)));
    } else {
      const ext = path.extname(name).toLowerCase();
      if (!SUPPORTED.has(ext)) continue;
      if (EXCLUDE_FILE.test(stripSp(name))) continue;
      out.push(path.join(dir, ent.name));
    }
  }
  return out;
};

const pickBest = (personDir, files) => {
  if (!files.length) return null;
  return files
    .map((f) => {
      const b = path.basename(f);
      const rel = path.relative(personDir, f);
      return {
        f,
        score: priority(b),
        backup: BACKUP_PATH.test(nfc(rel)) ? 1 : 0,
        stale: staleName(b) ? 1 : 0,
        depth: rel.split(/[\\/]/).length,
        ext: extRank(path.extname(b).toLowerCase()),
        len: nfc(b).length,
      };
    })
    .sort((a, b) =>
      b.score - a.score || a.backup - b.backup || a.stale - b.stale ||
      a.depth - b.depth || b.ext - a.ext || a.len - b.len,
    )[0].f;
};

// ── person 폴더 목록 구성 (필터는 NFC 로, 경로는 원본명으로) ──
const subdirs = (dir, filter = () => true) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && filter(nfc(e.name)))
        .map((e) => path.join(dir, e.name))
    : [];

const persons = [];
for (const d of subdirs(BASE, (n) => !n.startsWith("★") && !n.startsWith("_")))
  persons.push({ group: "외부", dir: d });
const WL = subdirs(BASE, (n) => /WHITE/i.test(n))[0];
if (WL) for (const d of subdirs(WL)) persons.push({ group: "화이트", dir: d });
const INNER = subdirs(BASE, (n) => /내부인력/.test(n))[0];
if (INNER) {
  for (const d of subdirs(INNER, (n) => !n.startsWith("_"))) persons.push({ group: "내부", dir: d });
  const RETIRE = subdirs(INNER, (n) => n.startsWith("_퇴사"))[0];
  if (RETIRE) for (const d of subdirs(RETIRE)) persons.push({ group: "내부", dir: d });
  const FREE = subdirs(INNER, (n) => /프리랜서/.test(n))[0];
  if (FREE) {
    for (const d of subdirs(FREE, (n) => !/^0\./.test(n))) persons.push({ group: "내부", dir: d });
    const DONE = subdirs(FREE, (n) => /^0\./.test(n))[0];
    if (DONE) for (const d of subdirs(DONE)) persons.push({ group: "내부", dir: d });
  }
}

// ── 선별 + (옵션) 복사 ──
const used = new Set();
const safeOrig = (b) => nfc(b).replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim().slice(0, 24);
const uniqueDest = (tag, orig, ext) => {
  let name = `${tag}__${orig}${ext}`;
  let i = 1;
  while (used.has(name.toLowerCase()) || fs.existsSync(path.join(INBOX, name))) name = `${tag}__${orig}_${i++}${ext}`;
  used.add(name.toLowerCase());
  return name;
};

const selected = [];
const skipped = [];
for (const p of persons) {
  const folderName = nfc(path.basename(p.dir));
  const best = pickBest(p.dir, gather(p.dir));
  if (!best) { skipped.push({ ...p, folderName }); continue; }
  const { tag } = parseFolder(path.basename(p.dir));
  const ext = path.extname(best).toLowerCase();
  selected.push({ group: p.group, folderName, src: best, dest: uniqueDest(tag, safeOrig(path.basename(best)), ext) });
}

const counts = selected.reduce((a, s) => ((a[s.group] = (a[s.group] || 0) + 1), a), {});
console.log(`\n선별: ${selected.length}건 (외부 ${counts["외부"]||0} / 화이트 ${counts["화이트"]||0} / 내부 ${counts["내부"]||0}) · 건너뜀 ${skipped.length} · 전체 인력폴더 ${persons.length}`);
for (const s of selected) console.log(`  [${s.group}] ${s.dest}\n        ← ${nfc(path.relative(INBOX, s.src))}`);
if (skipped.length) {
  console.log(`\n── 이력서/프로필 못 찾아 건너뛴 인력 ──`);
  const debug = process.argv.includes("--debug");
  const rawAll = (dir) => {
    const out = [];
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.isDirectory()) out.push(...rawAll(path.join(dir, ent.name)));
      else if (SUPPORTED.has(path.extname(nfc(ent.name)).toLowerCase())) out.push(path.join(dir, ent.name));
    }
    return out;
  };
  for (const s of skipped) {
    console.log(`  · [${s.group}] ${s.folderName}`);
    if (debug) for (const f of rawAll(s.dir)) console.log(`        (있음) ${nfc(path.relative(s.dir, f))}`);
  }
}

if (apply) {
  for (const s of selected) fs.copyFileSync(s.src, path.join(INBOX, s.dest));
  console.log(`\n✅ ${selected.length}개 파일을 resumes-inbox/ 최상위로 복사 완료.`);
} else {
  console.log(`\n(미리보기 — 복사하려면 --apply)`);
}
