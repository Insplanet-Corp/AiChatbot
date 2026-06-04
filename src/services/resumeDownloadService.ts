import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { saveAs } from "file-saver";
import type { ResumeData, ResumeSkillItem, ResumeCertificationItem } from "../types/resume";
import { formatExperience } from "../utils/formatters";

// -------------------------------------------------------
// 템플릿 변수 헬퍼
// -------------------------------------------------------
const strOr = (v: unknown, fallback = "") =>
  v != null && String(v).trim() ? String(v).trim() : fallback;

const skillName = (item: ResumeSkillItem) =>
  typeof item === "string" ? item : strOr(item.skill_name);
const skillLevel = (item: ResumeSkillItem) =>
  typeof item === "string" ? "" : strOr(item.proficiency_level);
const skillNote = (item: ResumeSkillItem) =>
  typeof item === "string" ? "" : strOr(item.notes);

const certName = (item: ResumeCertificationItem) =>
  typeof item === "string" ? item : strOr(item.certification_name);
const certIssuer = (item: ResumeCertificationItem) =>
  typeof item === "string" ? "" : strOr(item.issuer);
const certDate = (item: ResumeCertificationItem) =>
  typeof item === "string" ? "" : strOr(item.acquisition_date);

const datePeriod = (start?: string, end?: string) =>
  `${strOr(start)} ~ ${strOr(end) || "현재"}`;

// -------------------------------------------------------
// ResumeData → 템플릿 변수 매핑
// (public/resume_template.docx 플레이스홀더와 1:1 대응)
// -------------------------------------------------------
const buildTemplateData = (
  name: string,
  rd: ResumeData,
  totalExperienceMonths: number,
) => {
  const pi = rd.personal_info ?? {};
  const ps = rd.professional_summary ?? {};

  const eduList = (rd.educations ?? rd.education ?? []);
  const expList = rd.work_experiences ?? [];
  const skillList = rd.skills ?? [];
  const certList = rd.certifications ?? [];
  const langList = rd.languages ?? [];
  const awardList = rd.awards ?? [];
  const projectList = rd.projects ?? [];

  // core_competencies: string[] | Array<{desc}|string>
  const abilityList: string[] = [
    ...(Array.isArray(ps.core_competencies)
      ? ps.core_competencies.map((c) =>
          typeof c === "string" ? c : strOr((c as any).desc),
        )
      : []),
    ...(Array.isArray(rd.abilities)
      ? rd.abilities.map((a) =>
          typeof a === "string" ? a : strOr(a.desc),
        )
      : []),
  ].filter(Boolean);

  return {
    // ── 기본 정보 ──────────────────────────────────────
    name:            strOr(name, "이름없음"),
    jobTitle:        strOr(ps.current_role),
    birthDate:       strOr(pi.birth_date),
    gender:          strOr(pi.gender),
    totalExperience: formatExperience(totalExperienceMonths),
    skillRating:     strOr(ps.skill_grade),
    address:         strOr(pi.address),

    // ── 학력 ──────────────────────────────────────────
    education: eduList.map((e) => ({
      date:      datePeriod(e.start_date, e.end_date),
      school:    strOr(e.school_name),
      specialty: strOr(e.major),
      state:     strOr(e.graduation_status),
    })),

    // ── 경력 ──────────────────────────────────────────
    experience: expList.map((w) => ({
      period:           datePeriod(w.start_date, w.end_date),
      company:          strOr(w.company_name),
      department:       strOr(w.department),
      position:         strOr(w.job_title),
      task:             strOr(w.responsibilities),
    })),

    // ── 핵심역량 (조건부 섹션) ────────────────────────
    hasAbility: abilityList.length > 0,
    abilities:  abilityList.map((desc) => ({ desc })),

    // ── 보유기술 (조건부 섹션) ────────────────────────
    hasSkill: skillList.length > 0,
    skill: skillList.map((s) => ({
      name:  skillName(s),
      level: skillLevel(s),
      note:  skillNote(s),
    })),

    // ── 보유자격 (조건부 섹션) ────────────────────────
    hasCertificate: certList.length > 0,
    certificate: certList.map((c) => ({
      name:   certName(c),
      issuer: certIssuer(c),
      date:   certDate(c),
    })),

    // ── 어학 (조건부 섹션) ───────────────────────────
    hasLang: langList.length > 0,
    lang: langList.map((l) => ({
      name:  strOr(l.language),
      test:  strOr(l.test_name),
      score: strOr(l.score),
      date:  strOr(l.acquisition_date),
    })),

    // ── 수상경력 (조건부 섹션) ────────────────────────
    hasCareer: awardList.length > 0,
    career: awardList.map((a) => ({
      name:  strOr(a.competition_name),
      award: strOr(a.award_name),
      host:  strOr(a.host_organization),
      date:  strOr(a.award_date),
    })),

    // ── 프로젝트 수행경력 ─────────────────────────────
    project: projectList.map((p) => ({
      date:             datePeriod(p.start_date, p.end_date),
      name:             strOr(p.project_name),
      customer:         strOr(p.client_company),
      part:             strOr(p.role_and_tasks),
      responsibilities: strOr(p.outcomes),
    })),
  };
};

// -------------------------------------------------------
// 공개 API: 이력서 docx 다운로드
// -------------------------------------------------------
export const downloadResumeDocx = async (
  name: string,
  rd: ResumeData,
  totalExperienceMonths: number,
) => {
  // 1. 템플릿 fetch
  const res = await fetch("/resume_template.docx");
  if (!res.ok) throw new Error("이력서 템플릿을 불러오지 못했습니다.");
  const arrayBuffer = await res.arrayBuffer();

  // 2. docxtemplater 렌더링
  const zip = new PizZip(arrayBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "", // 미정의 변수 → 빈 문자열
  });

  doc.render(buildTemplateData(name, rd, totalExperienceMonths));

  // 3. 저장
  const blob = doc.getZip().generate({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  saveAs(blob, `${name}_이력서.docx`);
};
