export const SERVICE_NAME = "insPick";

export const JOB_CATEGORIES = ["기획", "디자인", "퍼블리싱", "개발"] as const;
export type JobCategory = typeof JOB_CATEGORIES[number];

export const CANDIDATE_GRADES = ["초급", "중급", "고급", "특급"] as const;
export type CandidateGrade = typeof CANDIDATE_GRADES[number];

// 홈/대화 페이지 입력창의 예시 추천 프롬프트
export const CHAT_SUGGESTIONS = [
  { label: "금융권 경험있는 기획자", value: "금융권 경험이 있는 기획자를 찾아주세요." },
  { label: "리액트 경험있는 퍼블리셔", value: "React 경험이 있는 퍼블리셔를 찾아주세요." },
];
