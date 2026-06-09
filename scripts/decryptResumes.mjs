/**
 * 이력서 평문 조회 스크립트 (Node 전용)
 *
 * ※ 이력서 암호화가 제거되어(resume_data 컬럼 삭제, 평문 컬럼/JSONB 로 세분화)
 *   더 이상 복호화가 필요 없다. 이 스크립트는 이제 평문 컬럼을 그대로 읽어 보여준다.
 *   (파일명은 이전 호환을 위해 유지. DB 에서 직접 보려면 Studio 나 psql 도 가능)
 *
 * 사용법:
 *   node scripts/decryptResumes.mjs                # 최근 10건 요약
 *   node scripts/decryptResumes.mjs --limit 3      # 건수 지정
 *   node scripts/decryptResumes.mjs --id <uuid>    # 특정 행 1건
 *   node scripts/decryptResumes.mjs --full         # 경력/프로젝트 등 JSONB 까지 전체 출력
 *
 * 주의: 출력에 실제 PII(이름/연락처/주소)가 그대로 찍히므로 로컬에서만 사용할 것.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const missing = [
  ["VITE_SUPABASE_URL", SUPABASE_URL],
  ["VITE_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY],
].filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`❌ .env 에 다음 값이 없습니다: ${missing.join(", ")}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const getArg = (name) => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : undefined; };
const hasFlag = (name) => args.includes(name);

const id = getArg("--id");
const limit = Number(getArg("--limit") ?? 10);
const full = hasFlag("--full");

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const COLUMNS =
  "id, name, job_category, total_experience_months, rating, created_at, " +
  "email, phone, birth_date, gender, address, current_position, skill_grade, file_grade, introduction, one_line_review, " +
  "core_competencies, skills, work_experiences, projects, educations, certifications, languages, awards";

const run = async () => {
  let query = supabase.from("resumes").select(COLUMNS).order("created_at", { ascending: false });
  query = id ? query.eq("id", id) : query.limit(limit);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (!data?.length) { console.log("조회된 행이 없습니다."); return; }

  console.log(`\n총 ${data.length}건\n${"=".repeat(60)}`);

  data.forEach((row, idx) => {
    console.log(`\n[${idx + 1}] id=${row.id}`);
    console.log(`  이름        : ${row.name ?? "-"}`);
    console.log(`  직군        : ${row.job_category ?? "-"}`);
    console.log(`  직무        : ${row.current_position ?? "-"}  / 등급(파일): ${row.file_grade ?? "-"}`);
    console.log(`  총경력(월)  : ${row.total_experience_months ?? "-"}`);
    console.log(`  연락처      : ${row.phone ?? "-"}`);
    console.log(`  이메일      : ${row.email ?? "-"}`);
    console.log(`  주소        : ${row.address ?? "-"}`);
    console.log(`  생년월일    : ${row.birth_date ?? "-"}`);
    console.log(`  경력 ${(row.work_experiences ?? []).length}건 / 프로젝트 ${(row.projects ?? []).length}건 / 기술 ${(row.skills ?? []).length}건`);

    if (full) {
      console.log(`  --- 전체 ---`);
      console.log(JSON.stringify(row, null, 2));
    }
  });

  console.log(`\n${"=".repeat(60)}\n완료.`);
};

run().catch((e) => { console.error("실행 오류:", e.message); process.exit(1); });
