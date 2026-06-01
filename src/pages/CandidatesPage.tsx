import { useNavigate, Outlet, useLocation } from "react-router-dom";
import styled from "styled-components";
import { decryptJSON } from "../utils/encrypt";
import { useCandidateList } from "../hooks/queries";
import { CandidateCard } from "../components/CandidateCard";
import { ContentInner, FixedTop, Main, ScrollBody } from "../components/layouts";
import Text from "../components/common/text/Text";
import Spacer from "../components/Spacer";

const safeDecryptName = (raw: string, fallback: string): string => {
  try {
    const result = decryptJSON<string>(raw);
    return typeof result === "string" ? result : fallback;
  } catch {
    return fallback;
  }
};

const safeDecryptResumeData = (raw: any): any => {
  try {
    if (typeof raw === "string") return decryptJSON(raw);
    if (raw?.encrypted) return decryptJSON(raw);
    return raw || {};
  } catch {
    return raw || {};
  }
};

const mapRowToCardData = (row: any) => {
  const rd = safeDecryptResumeData(row.resume_data);
  const name = safeDecryptName(row.name, rd?.personal_info?.name || "이름 없음");

  const expYears = Math.floor((row.total_experience_months || 0) / 12);
  const expMonths = (row.total_experience_months || 0) % 12;
  const expLabel =
    expYears > 0
      ? `경력 ${expYears}년 ${expMonths > 0 ? `${expMonths}개월` : ""}`
      : expMonths > 0
        ? `경력 ${expMonths}개월`
        : "신입";

  const birthYear = rd?.personal_info?.birth_date
    ? parseInt(rd.personal_info.birth_date.substring(0, 4))
    : null;

  const latestJob = Array.isArray(rd?.work_experiences) && rd.work_experiences[0];
  const category = latestJob?.job_title || rd?.personal_info?.desired_position || "직군 미상";

  const skills: string[] = Array.isArray(rd?.skills)
    ? rd.skills.map((s: any) => s.skill_name || s).filter(Boolean)
    : [];

  const qualifications: string[] = Array.isArray(rd?.certifications)
    ? rd.certifications.map((c: any) => c.certification_name || c).filter(Boolean)
    : [];

  const finalEducation = Array.isArray(rd?.education) && rd.education[0]
    ? `${rd.education[0].school_name || ""} ${rd.education[0].major || ""}`.trim()
    : "-";

  const majorExperience = latestJob
    ? `${latestJob.company_name || ""} / ${latestJob.job_title || ""}`.trim()
    : "-";

  const introduction =
    rd?.evaluation?.one_line_review ||
    rd?.professional_summary?.introduction ||
    "";

  return {
    id: row.id,
    name,
    profile_image: rd?.personal_info?.profile_image_url || null,
    introduction,
    is_kosa_verified: false,
    basic_info: {
      category,
      experience_total: expLabel,
      birth_year: birthYear,
    },
    details: {
      final_education: finalEducation,
      qualifications,
      major_experience: majorExperience,
      skills,
      internal_rating: row.rating || 0,
    },
  };
};

const CandidatesPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const { data: rows = [], isLoading, isError } = useCandidateList();

  const candidates = rows.map(mapRowToCardData);

  return (
    <Main>
      <FixedTop>
        <TopNav>
          <NavTab
            $active={location.pathname.startsWith("/chat")}
            onClick={() => navigate("/chat")}
          >
            인력 찾기
          </NavTab>
          <NavTab
            $active={location.pathname.startsWith("/candidates")}
            onClick={() => navigate("/candidates")}
          >
            인력 프로필
          </NavTab>
        </TopNav>
        <ContentInner size="wide">
          <HeaderRow>
            <Text variant="headingSm" weight="bold" as="h2">
              인력 프로필
            </Text>
            <Text variant="bodyMd" color="var(--color-text-tertiary)">
              총 {candidates.length}명
            </Text>
          </HeaderRow>
        </ContentInner>
      </FixedTop>

      <ScrollBody>
        <ContentInner size="wide">
          <Spacer size={24} />

          {isLoading && (
            <EmptyState>
              <Text variant="bodyMd" color="var(--color-text-muted)">불러오는 중...</Text>
            </EmptyState>
          )}

          {isError && (
            <EmptyState>
              <Text variant="bodyMd" color="var(--color-text-status-negative)">데이터를 불러오지 못했습니다.</Text>
            </EmptyState>
          )}

          {!isLoading && !isError && candidates.length === 0 && (
            <EmptyState>
              <Text variant="bodyMd" color="var(--color-text-muted)">등록된 인력 프로필이 없습니다.</Text>
            </EmptyState>
          )}

          <CardGrid>
            {candidates.map((candidate) => (
              <CandidateCard
                key={candidate.id}
                data={candidate}
                onClick={() => navigate(`candidate/${candidate.id}`)}
              />
            ))}
          </CardGrid>

          <Spacer size={40} />
        </ContentInner>
      </ScrollBody>

      <Outlet />
    </Main>
  );
};

const TopNav = styled.nav`
  display: flex;
  align-items: center;
  gap: var(--space-4, 4px);
  padding: 0 2rem;
  border-bottom: 1px solid var(--color-border-muted, #e6e8ea);
  background: var(--color-bg-primary, #ffffff);
`;

const NavTab = styled.button<{ $active?: boolean }>`
  padding: 14px 20px;
  font-size: var(--font-size-label-md, 14px);
  font-weight: ${({ $active }) => ($active ? "var(--font-weight-semibold, 600)" : "var(--font-weight-regular, 400)")};
  color: ${({ $active }) => ($active ? "var(--color-text-emphasis, #181a1b)" : "var(--color-text-tertiary, #878a92)")};
  background: none;
  border: none;
  border-bottom: 2px solid ${({ $active }) => ($active ? "var(--color-text-emphasis, #181a1b)" : "transparent")};
  cursor: pointer;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;

  &:hover {
    color: var(--color-text-emphasis, #181a1b);
  }
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-16, 16px) 0;
  border-bottom: 1px solid var(--color-border-muted, #e6e8ea);
`;

const CardGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
`;

const EmptyState = styled.div`
  display: flex;
  justify-content: center;
  padding: 80px 0;
`;

export default CandidatesPage;
