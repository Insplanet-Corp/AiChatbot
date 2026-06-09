#!/usr/bin/env node
/**
 * 기존 암호화 이력서(resume_data) → 평문 컬럼/JSONB 이전 (1회성 마이그레이션)
 *
 * 001_denormalize_resumes.sql 로 새 컬럼을 추가한 뒤 실행한다.
 * 각 행의 resume_data 를 VITE_SECRET_KEY 로 복호화해 새 컬럼(email/phone/skills/
 * work_experiences ...)을 채운다. resume_data 컬럼 자체는 건드리지 않으며,
 * 검증 후 003_drop_resume_data.sql 로 따로 DROP 한다.
 *
 * 사용법:
 *   node scripts/migrateResumesPlaintext.mjs            # 전체 이전
 *   node scripts/migrateResumesPlaintext.mjs --dry-run  # 미리보기(쓰기 안 함)
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import CryptoJS from "crypto-js";

const SECRET_KEY = process.env.VITE_SECRET_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const missing = [
  ["VITE_SECRET_KEY", SECRET_KEY],
  ["VITE_SUPABASE_URL", SUPABASE_URL],
  ["VITE_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY],
].filter(([, v]) => !v).map(([k]) => k);
if (missing.length) { console.error(`❌ .env 누락: ${missing.join(", ")}`); process.exit(1); }

const dryRun = process.argv.includes("--dry-run");

// --- 복호화 (scripts/decryptResumes.mjs 와 동일) ---
const decryptJSON = (s) => {
  const bytes = CryptoJS.AES.decrypt(s, SECRET_KEY);
  const str = bytes.toString(CryptoJS.enc.Utf8);
  if (!str) throw new Error("복호화 결과 비어있음(키 불일치?)");
  return JSON.parse(str);
};
const tryDecrypt = (value, fallback = null) => {
  try {
    if (typeof value === "string") return decryptJSON(value);
    if (value && typeof value === "object" && typeof value.encrypted === "string") return decryptJSON(value.encrypted);
    return value ?? fallback;
  } catch {
    return fallback;
  }
};

// --- ResumeData → 컬럼 매핑 (src/services/resumeService.ts resumeDataToColumns 와 동기화) ---
// JSON 의 current_role 은 예약어 회피로 컬럼 current_position 에 들어간다.
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

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const run = async () => {
  const { data: rows, error } = await supabase
    .from("resumes")
    .select("id, name, resume_data")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  console.log(`\n총 ${rows.length}행 이전 시작 ${dryRun ? "(DRY-RUN: 쓰기 안 함)" : ""}\n${"=".repeat(60)}`);

  let ok = 0, fail = 0;
  for (const row of rows) {
    const rd = tryDecrypt(row.resume_data, {}) ?? {};
    const decryptedName = tryDecrypt(row.name, null);
    const plaintextName =
      (typeof decryptedName === "string" && decryptedName) ||
      rd?.personal_info?.name ||
      row.name ||
      "이름없음";

    const okData = rd && typeof rd === "object" && Object.keys(rd).length > 0;
    const cols = resumeDataToColumns(rd);

    if (dryRun) {
      console.log(`  ${okData ? "✅" : "⚠️ "} ${plaintextName.padEnd(10)}  경력 ${cols.work_experiences.length} / 프로젝트 ${cols.projects.length} / 기술 ${cols.skills.length}  (복호화 ${okData ? "성공" : "실패/평문"})`);
      okData ? ok++ : fail++;
      continue;
    }

    const { error: upErr } = await supabase
      .from("resumes")
      .update({ name: plaintextName, ...cols })
      .eq("id", row.id);

    if (upErr) {
      console.error(`  ❌ ${plaintextName}: ${upErr.message}`);
      fail++;
    } else {
      console.log(`  ✅ ${plaintextName.padEnd(10)}  경력 ${cols.work_experiences.length} / 프로젝트 ${cols.projects.length} / 기술 ${cols.skills.length}`);
      ok++;
    }
  }

  console.log(`\n${"=".repeat(60)}\n완료 — 성공 ${ok} / 실패·평문 ${fail} (총 ${rows.length})\n`);
};

run().catch((e) => { console.error("실행 오류:", e.message); process.exit(1); });
