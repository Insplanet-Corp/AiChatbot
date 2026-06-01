export const SERVICE_NAME = "insPick";

export const JOB_CATEGORIES = ["기획", "디자인", "퍼블리싱", "개발"] as const;
export type JobCategory = typeof JOB_CATEGORIES[number];
