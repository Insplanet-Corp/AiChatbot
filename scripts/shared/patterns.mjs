// 이력서 원문에서 프로젝트/수상경력 섹션이 시작되는 지점을 찾는 패턴.
// src/constants/resumePrompt.ts 의 PROJECT_SECTION_PATTERN 과 동기화 유지.
export const PROJECT_SECTION_PATTERN =
  /(?:수상경력|프로젝트\s*수행\s*경력|프로젝트\s*이력|수행\s*경력|PROJECT)/i;
