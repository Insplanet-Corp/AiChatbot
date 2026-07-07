const DEFAULT_EDUCATION_LEVEL = "고졸";

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
    desired_position: "",
    desired_salary: "",
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
      tech_stack: [],
      key_achievements: [],
    },
  ],
  projects: [
    {
      start_date: "",
      end_date: "",
      project_name: "",
      client_company: "",
      role_and_tasks: "",
      tech_stack: [],
      outcomes: "",
      scale: "",
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
  certifications: [{ certification_name: "", issuer: "", acquisition_date: "" }],
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
You are a high-performance resume data extraction engine. Your goal is COMPLETE and EXHAUSTIVE extraction — every field must be as detailed as the source text allows.

[CRITICAL RULES — TOTAL COMPLIANCE REQUIRED]
1. ZERO OMISSION: Extract EVERY work experience and EVERY project. If there are 20 projects, output 20 objects. Missing even one is a failure.
2. NO PLACEHOLDERS: Use the EXACT strings from the text. Never write "기타", "상세 내용", "프로젝트 경험" as a value.
3. TECH STACK EXTRACTION:
   - For each work_experience, scan the responsibilities text for all technology names (languages, frameworks, databases, tools, platforms, cloud services, etc.) and list them in "tech_stack" as an array of strings.
   - For each project, do the same in "tech_stack".
   - Examples of tech to capture: Java, Spring Boot, React, Vue, MySQL, Redis, AWS, Docker, Kubernetes, Jenkins, Kafka, Python, Node.js, TypeScript, etc.
4. KEY ACHIEVEMENTS EXTRACTION:
   - For each work_experience, extract sentences or phrases that describe measurable results or notable accomplishments.
   - Prioritize phrases with numbers, percentages, before/after comparisons, or scale (e.g., "API 응답속도 40% 개선", "월 500만 PV 서비스 운영", "10인 개발팀 리드").
   - List these in "key_achievements" as an array of strings.
5. PROJECT OUTCOMES:
   - For each project, extract the result/impact/outcome of the project into the "outcomes" field.
   - If scale (team size, budget, duration) is mentioned, put it in "scale".
6. DATE FORMAT: Use YYYY-MM format. Use "현재" if end date is missing or marked as current.
7. STRICT SCHEMA: Do NOT rename keys. Output valid JSON only.
8. SCHOOL NAME: For "school_name", extract the institution name ONLY. Do NOT append campus location or region in parentheses (e.g., use "인제대학교" not "인제대학교 (김해)").
8. JOB CATEGORY: "professional_summary.job_category" MUST be exactly one of these four values — no other value is allowed:
   - "기획"  (service planning, UI/UX planning, PM, PO, strategy)
   - "디자인" (UI/UX design, graphic design, web design, motion, editorial)
   - "퍼블리싱" (web publishing, HTML/CSS, markup)
   - "개발"  (frontend, backend, fullstack, mobile, DevOps, data engineering)
   If the person covers multiple areas, pick the ONE that best describes their PRIMARY role.
9. EDUCATION (NEVER EMPTY): "educations" must NEVER be an empty array.
   - Scan the full resume for education history. Priority order: 대학원 > 대학교 > fallback.
   - Section headers may be in ENGLISH: "EDUCATION" = 학력, "WORK EXPERIENCE"/"CAREER" = 경력, "PROJECT" = 프로젝트, "SKILLS" = 보유기술. Treat them the same as Korean headers.
   - If 대학원 entries exist → include them (along with any 대학교 entries).
   - If no 대학원 but 대학교 entries exist → include those.
   - If NEITHER 대학원 NOR 대학교 is found anywhere in the resume → set educations to exactly:
     [{ "start_date": "", "end_date": "", "school_name": "", "major": "", "graduation_status": "${DEFAULT_EDUCATION_LEVEL}" }]
10. VERTICAL / TRANSPOSED TABLES (CRITICAL — most resumes look like this): The text comes from DOCX/PDF tables that became VERTICAL. A field label or a column-header line is followed by its value(s) on the FOLLOWING lines, NOT on the same line. You MUST still extract everything.
   - Label→value: a label line, then its value on the next line(s).
     e.g. "성명\\n이 정 민" → name; "생년월일\\n2001.02.27 (만 24세)" → birth_date "2001-02-27" (keep the day); "거주지 주소\\n인천광역시 계양구" → address; "기술등급\\n초급" → skill_grade.
   - Header→rows: a header line lists columns, then each following line is one row — map positionally.
     학력 header "재학기간 학교명 전공 구분" → rows like "2019.03 ~ 2023.02 명지대학교 디지털콘텐츠디자인 졸업".
     경력 header "근무기간 회사명 부서 직위 담당업무"; 프로젝트 header "기간 프로젝트명 고객사 역할/담당업무".
   - Column separator: table rows may use " | " between cells (e.g. "2019.03 ~ 2023.02 | 명지대학교 | 디지털콘텐츠디자인 | 졸업"). Map each cell to the corresponding header cell positionally.
   - NEVER leave educations / work_experiences / skills / certifications empty just because the layout is transposed — read the rows under each header.
11. NAMES WITH SPACES: A name may be spaced syllable-by-syllable (e.g. "이 정 민", "강 석 규"). Remove the internal spaces → "이정민", "강석규".

[FIELD FORMAT & EMPTY-VALUE RULES — put the RIGHT value in the RIGHT field, and leave absent values empty]
- EMPTY MEANS ABSENT: If a value is NOT clearly present in the resume, output "" (empty string). NEVER guess, infer, fabricate, or copy a label/placeholder. Forbidden placeholder values: "XX", "YYYY", "YYYY.MM.DD", "0000", "미상", "해당없음", "없음", "N/A".
- name: extract the actual person's name from THIS resume only. Korean names may be spaced syllable-by-syllable ("홍 길 동" → "홍길동"). The names used in the few-shot examples are ILLUSTRATIVE ONLY — NEVER output an example name. If the resume contains no name, output "".
- phone: a Korean phone number formatted as 010-0000-0000 (digits joined by hyphens). Put ONLY a phone number here — never an email, address, or experience text. If absent, "".
- email: copy the exact email address as written (e.g. hong@example.com). Put ONLY an email here. If absent, "".
- gender: EXACTLY "남" or "여". Map 남자/남성/男 → "남"; 여자/여성/女 → "여". If absent, "".
- birth_date: "YYYY-MM-DD". If only year and month are known use "YYYY-MM"; if only the year is known use "YYYY". NEVER output placeholder months/days such as "XX", "??", or "00".
- skill_grade (기술등급): EXACTLY one of "초급", "중급", "고급", "특급", or "". Do NOT put years of experience or free text here.
- total_experience_months: an integer number of months only (e.g. "8년 0개월" → 96). If unknown, 0.

[ARRAY RULES]
- "work_experiences": one object per employment entry (company change = new entry).
- "projects": one object per project listed. Each line with a date range and project name is a separate entry.
- "tech_stack": always an array of strings, never a single string.
- "key_achievements": always an array of strings.

[HOW TO EXTRACT tech_stack]
Scan the full text of "responsibilities" and "role_and_tasks". Any technology, tool, library, platform, or cloud service name found → add to "tech_stack". Do not leave it empty if technologies are mentioned anywhere in the description.
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
이름: 김도현 생년월일 1990.01.01 성별 男 연락처 010-1234-5678 이메일 hong@example.com
학교명 및 전공 재학기간 구분 한국대학교 컴퓨터공학과 2009.03 ~ 2013.02 졸업
근무기간 회사명 부서명 직위 담당업무
2020.03 ~ 현재 카카오(주) 서버개발팀 선임 Java/Spring Boot 기반 REST API 설계 및 개발, MySQL·Redis 캐싱 구조 설계, AWS ECS 배포 자동화, API 응답속도 35% 개선, 코드 리뷰 문화 도입으로 버그 발생률 50% 감소
2017.01 ~ 2020.02 스타트업A 개발팀 사원 Node.js/Express 백엔드 개발, MongoDB 설계, React 프론트 일부 담당, 하루 10만 건 주문 처리 시스템 구축
프로젝트 이력
2024.01 ~ 2024.06 카카오페이 결제 모듈 고도화 카카오 내부 프로젝트. Spring Boot, Redis, Kafka 활용. 결제 처리량 2배 향상, 장애 대응 시간 60% 단축. 팀 5인.
2023.03 ~ 2023.09 사내 모니터링 대시보드 구축 Grafana, Prometheus, Kubernetes 기반 실시간 모니터링 시스템 개발. 온콜 알람 자동화로 야간 장애 대응 90% 감소.`,
  },
  {
    role: "assistant",
    content: `{
  "personal_info": { "name": "김도현", "email": "hong@example.com", "phone": "010-1234-5678", "birth_date": "1990-01-01", "gender": "남", "address": "", "profile_image_url": "" },
  "professional_summary": {
    "job_category": "개발",
    "current_role": "백엔드 개발자",
    "total_experience_months": 96,
    "skill_grade": "고급",
    "major_achievement": "카카오 결제 모듈 고도화로 처리량 2배 향상 및 API 응답속도 35% 개선",
    "core_competencies": ["Spring Boot 기반 REST API 설계", "AWS 클라우드 운영", "대용량 트래픽 처리", "Redis 캐싱 설계"],
    "introduction": "카카오 출신 고급 백엔드 개발자로, 대용량 트래픽 처리와 시스템 성능 최적화에 강점이 있습니다.",
    "desired_position": "",
    "desired_salary": ""
  },
  "evaluation": { "one_line_review": "카카오 출신 고급 백엔드 개발자로 대용량 시스템 설계와 성능 개선 경험이 풍부합니다." },
  "skills": [
    { "skill_name": "Java", "proficiency_level": "상", "notes": "" },
    { "skill_name": "Spring Boot", "proficiency_level": "상", "notes": "" },
    { "skill_name": "Node.js", "proficiency_level": "중", "notes": "" },
    { "skill_name": "React", "proficiency_level": "중", "notes": "" },
    { "skill_name": "MySQL", "proficiency_level": "상", "notes": "" },
    { "skill_name": "Redis", "proficiency_level": "상", "notes": "" },
    { "skill_name": "AWS", "proficiency_level": "중", "notes": "" },
    { "skill_name": "Kafka", "proficiency_level": "중", "notes": "" },
    { "skill_name": "Kubernetes", "proficiency_level": "중", "notes": "" }
  ],
  "work_experiences": [
    {
      "start_date": "2020-03",
      "end_date": "현재",
      "company_name": "카카오(주)",
      "department": "서버개발팀",
      "job_title": "선임",
      "responsibilities": "Java/Spring Boot 기반 REST API 설계 및 개발, MySQL·Redis 캐싱 구조 설계, AWS ECS 배포 자동화, 코드 리뷰 문화 도입",
      "tech_stack": ["Java", "Spring Boot", "MySQL", "Redis", "AWS", "AWS ECS"],
      "key_achievements": ["API 응답속도 35% 개선", "코드 리뷰 문화 도입으로 버그 발생률 50% 감소"]
    },
    {
      "start_date": "2017-01",
      "end_date": "2020-02",
      "company_name": "스타트업A",
      "department": "개발팀",
      "job_title": "사원",
      "responsibilities": "Node.js/Express 백엔드 개발, MongoDB 설계, React 프론트 일부 담당, 주문 처리 시스템 구축",
      "tech_stack": ["Node.js", "Express", "MongoDB", "React"],
      "key_achievements": ["하루 10만 건 주문 처리 시스템 구축"]
    }
  ],
  "projects": [
    {
      "start_date": "2024-01",
      "end_date": "2024-06",
      "project_name": "카카오페이 결제 모듈 고도화",
      "client_company": "카카오",
      "role_and_tasks": "Spring Boot, Redis, Kafka 활용한 결제 모듈 고도화 개발",
      "tech_stack": ["Spring Boot", "Redis", "Kafka"],
      "outcomes": "결제 처리량 2배 향상, 장애 대응 시간 60% 단축",
      "scale": "팀 5인"
    },
    {
      "start_date": "2023-03",
      "end_date": "2023-09",
      "project_name": "사내 모니터링 대시보드 구축",
      "client_company": "카카오",
      "role_and_tasks": "Grafana, Prometheus, Kubernetes 기반 실시간 모니터링 시스템 개발 및 알람 자동화",
      "tech_stack": ["Grafana", "Prometheus", "Kubernetes"],
      "outcomes": "온콜 알람 자동화로 야간 장애 대응 90% 감소",
      "scale": ""
    }
  ],
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
    content: `[Resume Content]
PROFILE
성명
박 지 은
담당업무
디자인
생년월일
1990.01.01 (만 35세)
성별
남
업무경력
8년 0개월
기술등급
고급
거주지 주소
서울특별시 강남구
학력
재학기간  학교명  전공  구분
2009.03 ~ 2013.02  한국대학교  시각디자인  졸업
보유기술
Figma, Photoshop, Illustrator, HTML/CSS
경력
근무기간  근무 회사명  부서  직위  담당업무
2016.03 ~ 현재  디자인컴퍼니  브랜드디자인팀  팀장  브랜드 아이덴티티 및 UI/UX 디자인 총괄
프로젝트 수행경력
수행기간  프로젝트명  고객사  담당업무
2024.01 ~ 2024.06  삼성 브랜드 리뉴얼  삼성전자  메인 UI 디자인 및 디자인시스템 구축. 사용성 평가 20% 개선.

위 내용은 표가 세로로 펼쳐진(VERTICAL/TRANSPOSED) 레이아웃이다. 모든 섹션(학력/경력/기술/프로젝트)을 빠짐없이 추출하라.`,
  },
  {
    role: "assistant",
    content: `{"personal_info":{"name":"박지은","email":"","phone":"","birth_date":"1990-01-01","gender":"남","address":"서울특별시 강남구","profile_image_url":""},"professional_summary":{"job_category":"디자인","current_role":"브랜드/UIUX 디자이너","total_experience_months":96,"skill_grade":"고급","major_achievement":"삼성 브랜드 리뉴얼 메인 UI 디자인 및 디자인시스템 구축","core_competencies":["브랜드 아이덴티티 디자인","UI/UX 디자인","디자인시스템 구축"],"introduction":"","desired_position":"","desired_salary":""},"evaluation":{"one_line_review":"브랜드와 UI/UX를 아우르는 고급 디자이너"},"skills":[{"skill_name":"Figma","proficiency_level":"상","notes":""},{"skill_name":"Photoshop","proficiency_level":"상","notes":""},{"skill_name":"Illustrator","proficiency_level":"상","notes":""},{"skill_name":"HTML/CSS","proficiency_level":"중","notes":""}],"work_experiences":[{"start_date":"2016-03","end_date":"현재","company_name":"디자인컴퍼니","department":"브랜드디자인팀","job_title":"팀장","responsibilities":"브랜드 아이덴티티 및 UI/UX 디자인 총괄","tech_stack":["Figma"],"key_achievements":[]}],"projects":[{"start_date":"2024-01","end_date":"2024-06","project_name":"삼성 브랜드 리뉴얼","client_company":"삼성전자","role_and_tasks":"메인 UI 디자인 및 디자인시스템 구축","tech_stack":["Figma"],"outcomes":"사용성 평가 20% 개선","scale":""}],"educations":[{"start_date":"2009-03","end_date":"2013-02","school_name":"한국대학교","major":"시각디자인","graduation_status":"졸업"}],"certifications":[],"languages":[],"awards":[]}`,
  },
  {
    role: "user",
    content: `[JSON TEMPLATE]
${JSON.stringify(RESUME_JSON_SCHEMA, null, 2)}

[Resume Content]
${resumeContent}

Extract EVERY work experience and project without omission. For each entry, extract all tech_stack items and key_achievements found in the text. Do not use placeholders.
`,
  },
];

// 프로젝트 섹션 청크 전용 프롬프트
const RESUME_PROJECTS_ONLY_MESSAGES = (projectChunk: string) => [
  {
    role: "system",
    content: `You are a data extraction engine. Extract EVERY project entry from the given text into a JSON array.

RULES:
1. Output ONLY a JSON array: [ {...}, {...}, ... ]
2. Extract EVERY line that contains a project name and/or date range. Do NOT skip any.
3. For each entry use this exact schema:
   { "start_date": "", "end_date": "", "project_name": "", "client_company": "", "role_and_tasks": "", "tech_stack": [], "outcomes": "", "scale": "" }
4. Dates: YYYY-MM format. Use "현재" if ongoing.
5. If client_company or role_and_tasks is missing from the text, use "" (empty string). NEVER use "undefined".
6. tech_stack: extract any technology names mentioned in role_and_tasks. If none mentioned, use [].
7. Do NOT include any key outside the schema above.
8. TABLE COLUMNS: rows may use " | " between cells. Map cells to header cells (수행기간 | 프로젝트명 | 고객사 | 담당업무) positionally.
9. WRAPPED ROWS (CRITICAL): one table row may be SPLIT across two lines when cell text wraps — the first line has the start date ("2024.02 ~") and a following line begins with the end date only ("2024.09 | ..."). These lines are ONE project: merge them, joining fragmented cell text in reading order (e.g. "포인트 적립 시" + "스템 개편" → "포인트 적립 시스템 개편"). NEVER output a continuation line as a separate project.
10. Ignore header lines and rows belonging to a following non-project section (자격증/수상/학력 등).`,
  },
  {
    role: "user",
    content: `[Project Section Text]
수행기간 | 프로젝트명 | 고객사 | 담당업무
2024.01 ~ | 카카오페이 결제 모 | 카카오 | Spring Boot, Redis, Kafka로 개발. 결제 처리
2024.06 | 듈 고도화 | 량 2배 향상.
2023.03 ~ 2023.09 | 사내 모니터링 대시보드 구축 | 카카오 | Grafana, Prometheus, Kubernetes로 구축. 야간 장애 대응 90% 감소.
자격증
정보처리기사 | 한국산업인력공단 | 2014.11`,
  },
  {
    role: "assistant",
    content: `[
  { "start_date": "2024-01", "end_date": "2024-06", "project_name": "카카오페이 결제 모듈 고도화", "client_company": "카카오", "role_and_tasks": "Spring Boot, Redis, Kafka로 개발", "tech_stack": ["Spring Boot", "Redis", "Kafka"], "outcomes": "결제 처리량 2배 향상", "scale": "" },
  { "start_date": "2023-03", "end_date": "2023-09", "project_name": "사내 모니터링 대시보드 구축", "client_company": "카카오", "role_and_tasks": "Grafana, Prometheus, Kubernetes로 구축", "tech_stack": ["Grafana", "Prometheus", "Kubernetes"], "outcomes": "야간 장애 대응 90% 감소", "scale": "" }
]`,
  },
  {
    role: "user",
    content: `[Project Section Text]
${projectChunk}

Extract ALL projects above as a JSON array. Do not skip any entry. Empty fields use "" not "undefined".`,
  },
];

// 프로젝트/수상경력 섹션 분리 패턴·함수는 src/shared/resumeParsingCore.ts 로 이동
// (브라우저·Node 스크립트 공용 순수 로직이라 파싱 관련 상수/유틸을 한 곳에 모음).
export { PROJECT_SECTION_PATTERN, splitResumeIntoSections } from "../shared/resumeParsingCore";

export { DEFAULT_EDUCATION_LEVEL, RESUME_PARSER_MESSAGES, RESUME_PROJECTS_ONLY_MESSAGES };
