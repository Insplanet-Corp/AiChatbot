import { getEmbedding } from "../apis/ollama";
import { resumeDataToColumns } from "./resumeMapper";
import { supabase } from "./supabase";
import type { ResumeData } from "../types/resume";

// 1. 10개의 랜덤 더미 이력서 데이터
const dummyResumes = [
  {
    personal_info: {
      name: "김백엔",
      email: "backend@example.com",
      phone: "010-1111-2222",
      birth_date: "1992-03-15",
      gender: "남",
      address: "서울시 송파구",
      profile_image_url: "",
    },
    professional_summary: {
      job_category: "개발",
      current_role: "백엔드 개발자",
      total_experience_months: 84,
      skill_grade: "고급",
      major_achievement: "대규모 트래픽 결제 시스템 MSA 전환",
      core_competencies: [
        "Java/Spring Boot 기반 대규모 시스템 설계",
        "MSA 아키텍처 및 도커/쿠버네티스 운영",
      ],
      introduction:
        "안정적이고 확장 가능한 백엔드 시스템을 설계하는 7년 차 백엔드 개발자입니다.",
    },
    evaluation: {
      internal_rating: 4.5,
      one_line_review:
        "대규모 트래픽 처리 경험이 풍부하며 백엔드 아키텍처 설계 능력이 뛰어남.",
    },
    skills: [
      {
        skill_name: "Java / Spring Boot",
        proficiency_level: "상",
        notes: "실무 7년",
      },
    ],
    work_experiences: [
      {
        start_date: "2017-03",
        end_date: "2024-02",
        company_name: "페이먼트(주)",
        department: "결제개발팀",
        job_title: "선임",
        responsibilities: "결제 코어 API 개발",
      },
    ],
    projects: [
      {
        start_date: "2022-01",
        end_date: "2023-12",
        project_name: "차세대 결제 시스템 구축",
        client_company: "자사",
        role_and_tasks: "MSA 전환 리딩",
      },
    ],
    educations: [
      {
        start_date: "2011-03",
        end_date: "2017-02",
        school_name: "서울대학교",
        major: "컴퓨터공학과",
        graduation_status: "졸업",
      },
    ],
  },
];

// 2. 임베딩 + 암호화 + DB 일괄 삽입 함수
const seedDummyResumesToDB = async () => {
  console.log("더미 데이터 DB 삽입 시작...");

  try {
    const insertPromises = dummyResumes.map(async (parsedData) => {
      // 1. 임베딩(Vector) 생성을 위한 핵심 텍스트 조합
      const jobCategory = parsedData.professional_summary.job_category || "";
      const currentRole = parsedData.professional_summary.current_role || "";
      const skillString = parsedData.skills.map((s) => s.skill_name).join(", ");
      const competencyString =
        parsedData.professional_summary.core_competencies.join(" ");
      const projectString = parsedData.projects
        .map((p) => p.project_name)
        .join(", ");

      const textToEmbed =
        `직군: ${jobCategory}\n직무: ${currentRole}\n기술스택: ${skillString}\n핵심역량: ${competencyString}\n주요프로젝트: ${projectString}`.trim();

      // 2. bge-m3 임베딩 생성 (사용 중인 getEmbedding 함수 호출)
      const vector = await getEmbedding(textToEmbed);

      // 3. 평문 컬럼/JSONB 로 분해 (암호화 없음)
      const originalName = parsedData.personal_info.name.replace(/\s+/g, "");

      // 4. Supabase DB Insert 객체 반환
      return {
        name: originalName,
        job_category: jobCategory,
        total_experience_months:
          parsedData.professional_summary.total_experience_months,
        embedding: vector,
        ...resumeDataToColumns(parsedData as unknown as ResumeData),
      };
    });

    // 모든 더미 데이터의 임베딩과 암호화가 완료될 때까지 대기
    const rowsToInsert = await Promise.all(insertPromises);

    // Supabase 배열 Insert (Bulk Insert)
    const { data, error } = await supabase
      .from("resumes")
      .insert(rowsToInsert)
      .select();

    if (error) throw error;

    console.log(
      `성공적으로 ${data.length}개의 더미 데이터를 삽입했습니다!`,
      data,
    );
    alert("더미 데이터 삽입 완료!");
  } catch (error) {
    console.error("DB 삽입 중 오류 발생:", error);
    alert("데이터 삽입에 실패했습니다.");
  }
};

export { seedDummyResumesToDB };
