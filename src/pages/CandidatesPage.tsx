import { useNavigate, Outlet } from "react-router-dom";
import styled from "styled-components";
import { useState, useMemo } from "react";
import { useCandidateList } from "../hooks/queries";
import { CandidateCard } from "../components/CandidateCard";
import { ContentInner, FixedTop, Main, ScrollBody } from "../components/layouts";
import Text from "../components/common/text/Text";
import Spacer from "../components/Spacer";
import { mapRowToCardData } from "../services/candidateService";

const ALL_CATEGORY = "전체";

const CandidatesPage = () => {
  const navigate = useNavigate();

  const { data: rows = [], isLoading, isError } = useCandidateList();
  const candidates = useMemo(() => rows.map(mapRowToCardData), [rows]);

  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY);
  const [financeOnly, setFinanceOnly] = useState(false);
  const [itCertOnly, setItCertOnly] = useState(false);

  const categories = useMemo(() => {
    const set = new Set(candidates.map((c) => c.basic_info.category));
    return [ALL_CATEGORY, ...Array.from(set).filter(Boolean).sort()];
  }, [candidates]);

  const filtered = useMemo(() => {
    return candidates.filter((c) => {
      if (selectedCategory !== ALL_CATEGORY && c.basic_info.category !== selectedCategory) return false;
      if (financeOnly && !c.flags.has_finance_experience) return false;
      if (itCertOnly && !c.flags.has_it_certificate) return false;
      return true;
    });
  }, [candidates, selectedCategory, financeOnly, itCertOnly]);

  return (
    <Main>
      <FixedTop>
        <ContentInner size="wide">
          <HeaderRow>
            <Text variant="headingSm" weight="bold" as="h2">
              인력 프로필
            </Text>
            <Text variant="bodyMd" color="var(--color-text-tertiary)">
              {filtered.length}명 / 총 {candidates.length}명
            </Text>
          </HeaderRow>

          <FilterBar>
            <CategoryTabs>
              {categories.map((cat) => (
                <CategoryTab
                  key={cat}
                  $active={selectedCategory === cat}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </CategoryTab>
              ))}
            </CategoryTabs>

            <Toggles>
              <ToggleLabel>
                <Switch
                  type="checkbox"
                  checked={financeOnly}
                  onChange={(e) => setFinanceOnly(e.target.checked)}
                />
                <ToggleTrack $on={financeOnly}>
                  <ToggleThumb $on={financeOnly} />
                </ToggleTrack>
                <span>금융권 경력</span>
              </ToggleLabel>

              <ToggleLabel>
                <Switch
                  type="checkbox"
                  checked={itCertOnly}
                  onChange={(e) => setItCertOnly(e.target.checked)}
                />
                <ToggleTrack $on={itCertOnly}>
                  <ToggleThumb $on={itCertOnly} />
                </ToggleTrack>
                <span>정보처리기능사</span>
              </ToggleLabel>
            </Toggles>
          </FilterBar>
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

          {!isLoading && !isError && filtered.length === 0 && (
            <EmptyState>
              <Text variant="bodyMd" color="var(--color-text-muted)">
                조건에 맞는 인력 프로필이 없습니다.
              </Text>
            </EmptyState>
          )}

          <CardGrid>
            {filtered.map((candidate) => (
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
  padding: var(--space-16, 16px) 0 var(--space-12, 12px);
`;

const FilterBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-16, 16px);
  padding-bottom: var(--space-12, 12px);
  flex-wrap: wrap;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const CategoryTabs = styled.div`
  display: flex;
  gap: var(--space-4, 4px);
  flex-wrap: wrap;
`;

const CategoryTab = styled.button<{ $active: boolean }>`
  padding: 5px var(--space-12, 12px);
  border-radius: var(--radius-full, 999px);
  font-size: var(--font-size-label-sm, 12px);
  font-weight: ${({ $active }) => ($active ? "var(--font-weight-semibold, 600)" : "var(--font-weight-medium, 500)")};
  background: ${({ $active }) => ($active ? "var(--color-bg-solid-brand, #4949d4)" : "var(--color-bg-primary, #ffffff)")};
  color: ${({ $active }) => ($active ? "var(--color-text-inverse, #ffffff)" : "var(--color-text-secondary, #6d7178)")};
  border: 1px solid ${({ $active }) => ($active ? "var(--color-border-brand, #4949d4)" : "var(--color-border-muted, #e6e8ea)")};
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  white-space: nowrap;

  &:hover {
    border-color: var(--color-border-brand, #4949d4);
    color: ${({ $active }) => ($active ? "var(--color-text-inverse, #ffffff)" : "var(--color-text-brand-primary, #4949d4)")};
  }
`;

const Toggles = styled.div`
  display: flex;
  gap: var(--space-16, 16px);
  align-items: center;
  flex-shrink: 0;
`;

const Switch = styled.input`
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
`;

const ToggleLabel = styled.label`
  display: flex;
  align-items: center;
  gap: var(--space-8, 8px);
  cursor: pointer;
  font-size: var(--font-size-label-sm, 12px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text-secondary, #6d7178);
  user-select: none;
  position: relative;

  &:hover span:last-child {
    color: var(--color-text-primary, #3c3e44);
  }
`;

const ToggleTrack = styled.span<{ $on: boolean }>`
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  border-radius: var(--radius-full, 999px);
  background: ${({ $on }) => ($on ? "var(--color-bg-solid-brand, #4949d4)" : "var(--color-bg-surface-secondary, #e6e8ea)")};
  transition: background 0.2s;
  flex-shrink: 0;
`;

const ToggleThumb = styled.span<{ $on: boolean }>`
  position: absolute;
  top: 2px;
  left: ${({ $on }) => ($on ? "18px" : "2px")};
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: white;
  box-shadow: var(--shadow-1);
  transition: left 0.2s;
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
