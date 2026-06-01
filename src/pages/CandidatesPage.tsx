import { useNavigate, Outlet } from "react-router-dom";
import styled from "styled-components";
import { useCandidateList } from "../hooks/queries";
import { CandidateCard } from "../components/CandidateCard";
import { ContentInner, FixedTop, Main, ScrollBody } from "../components/layouts";
import Text from "../components/common/text/Text";
import Spacer from "../components/Spacer";
import { mapRowToCardData } from "../services/candidateService";

const CandidatesPage = () => {
  const navigate = useNavigate();

  const { data: rows = [], isLoading, isError } = useCandidateList();
  const candidates = rows.map(mapRowToCardData);

  return (
    <Main>
      <FixedTop>
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
              <Text variant="bodyMd" color="var(--color-text-muted)">
                불러오는 중...
              </Text>
            </EmptyState>
          )}

          {isError && (
            <EmptyState>
              <Text variant="bodyMd" color="var(--color-text-status-negative)">
                데이터를 불러오지 못했습니다.
              </Text>
            </EmptyState>
          )}

          {!isLoading && !isError && candidates.length === 0 && (
            <EmptyState>
              <Text variant="bodyMd" color="var(--color-text-muted)">
                등록된 인력 프로필이 없습니다.
              </Text>
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

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-16, 16px) 0;
`;

const CardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
`;

const EmptyState = styled.div`
  display: flex;
  justify-content: center;
  padding: 80px 0;
`;

export default CandidatesPage;
