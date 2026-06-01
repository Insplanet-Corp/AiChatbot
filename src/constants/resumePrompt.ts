const RESUME_JSON_SCHEMA = {
  personal_info: {
    name: "",
    email: "",
    phone: "",
    birth_date: "",
    gender: "",
    address: "",
    profile_image_url: "",
  },
  professional_summary: {
    job_category: "",
    current_role: "",
    total_experience_months: 0,
    skill_grade: "",
    major_achievement: "",
    core_competencies: [],
    introduction: "",
  },
  evaluation: {
    one_line_review: "",
  },
  skills: [{ skill_name: "", proficiency_level: "", notes: "" }],
  work_experiences: [
    {
      start_date: "",
      end_date: "",
      company_name: "",
      department: "",
      job_title: "",
      responsibilities: "",
    },
  ],
  projects: [
    {
      start_date: "",
      end_date: "",
      project_name: "",
      client_company: "",
      role_and_tasks: "",
    },
  ],
  educations: [
    {
      start_date: "",
      end_date: "",
      school_name: "",
      major: "",
      graduation_status: "",
    },
  ],
  certifications: [
    { certification_name: "", issuer: "", acquisition_date: "" },
  ],
  languages: [{ language: "", test_name: "", score: "", acquisition_date: "" }],
  awards: [
    {
      competition_name: "",
      award_name: "",
      host_organization: "",
      award_date: "",
    },
  ],
};

const RESUME_PARSER_SYSTEM_PROMPT = `
You are a high-performance data processing engine designed for COMPLETE and EXHAUSTIVE extraction.
Your task is to parse the [Resume Content] and extract EVERY SINGLE work experience and EVERY SINGLE project listed.

[CRITICAL INSTRUCTIONS - TOTAL COMPLIANCE REQUIRED]
1. ZERO OMISSION: You MUST NOT summarize or skip any projects. If there are 50 projects in the text, you MUST output 50 objects in the 'projects' array. Missing even one project is a failure.
2. NO PLACEHOLDERS: NEVER use words like "프로젝트 경험", "직무 경험", "상세 내용", "최근". Extract the EXACT strings from the text (e.g., "군인공제회 신 CMS 구축", "한국조폐공사 차세대 지급결제플랫폼 구축").
3. ARRAY STRUCTURE: 
   - 'work_experiences': Extract all employment history line by line.
   - 'projects': Extract all project history entries. Each line starting with a date (e.g., 2025.09 ~ 2025.10) is a new project.
4. DATE CONSISTENCY: Keep the start_date and end_date exactly as found. Use "현재" if the end date is missing or marked as "현재".
5. STRICT SCHEMA: Do NOT change key names. Use "work_experiences" and "projects" only.

[EXTRACTION GUIDELINE]
Scan the text from top to bottom. Every time you see a period (e.g., 2024.04 ~ 2024.12) followed by a company or project name, create a new object in the corresponding array. 
Even if the list is extremely long, you must process it until the very end.
`;

const RESUME_PARSER_MESSAGES = (resumeContent: string) => [
  {
    role: "system",
    content: RESUME_PARSER_SYSTEM_PROMPT,
  },
  {
    role: "user",
    content: `[JSON TEMPLATE]
(Schema omitted for brevity)
[Resume Content]
이름: 홍길동 생년월일 1990.01.01 성별 男
학교명 및 전공 재학기간 구분 한국대학교 컴퓨터공학과 2009.03 ~ 2013.02 졸업
근무기간 회사명 부서명 직위 담당업무 2015.01 ~ 현재 네이버(주) 개발팀 대리 백엔드 개발`,
  },
  {
    role: "assistant",
    content: `{
  "personal_info": { "name": "홍길동", "email": "", "phone": "", "birth_date": "1990-01-01", "gender": "남", "address": "", "profile_image_url": "" },
  "professional_summary": { "job_category": "개발", "current_role": "백엔드 개발자", "total_experience_months": 72, "skill_grade": "중급", "major_achievement": "", "core_competencies": ["백엔드 개발"], "introduction": "" },
  "evaluation": { "one_line_review": "네이버 개발팀 출신의 백엔드 개발자입니다." },
  "skills": [ { "skill_name": "Java", "proficiency_level": "중", "notes": "추론" } ],
  "work_experiences": [
    { "start_date": "2015-01", "end_date": "현재", "company_name": "네이버(주)", "department": "개발팀", "job_title": "대리", "responsibilities": "백엔드 개발" }
  ],
  "projects": [],
  "educations": [
    { "start_date": "2009-03", "end_date": "2013-02", "school_name": "한국대학교", "major": "컴퓨터공학과", "graduation_status": "졸업" }
  ],
  "certifications": [],
  "languages": [],
  "awards": []
}`,
  },
  {
    role: "user",
    content: `[JSON TEMPLATE]
${JSON.stringify(RESUME_JSON_SCHEMA, null, 2)}

[Resume Content]
${resumeContent}

Extract EVERY SINGLE experience and project. Do not skip any. Do not use placeholders.
`,
  },
];

export { RESUME_PARSER_MESSAGES };
