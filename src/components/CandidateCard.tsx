import React from "react";
import styled from "styled-components";
import Text from "./common/text/Text";
import Icon from "./common/Icon/Icon";
import { Avatar } from "./common/avatar";
import { CandidateDetailList } from "./CandidateDetailList";
import Row from "./common/flex/row";
import Box from "./common/flex/box";

const EMPTY_VALUE = "내용없음";

const CandidateCard = ({ data, onClick, isFavorite = false, onToggleFavorite }) => {
  if (!data || !data.basic_info) return null;

  const currentYear = 2026;
  const birthYear = data.basic_info.birth_year;
  const age = birthYear != null ? currentYear - birthYear : null;

  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite?.(data.id);
  };

  return (
    <Card onClick={onClick}>
      <Header>
        <Avatar style="photo" src={data.profile_image} alt={data.name} size={48} seed={data.name} />

        <UserInfo>
          <NameWrapper>
            <Text variant="bodyLg">{data.name}</Text>
{data.is_kosa_verified && (
              <Badge $bgColor="#D6F9FA" $textColor="#00838A">
                코사증빙
              </Badge>
            )}
          </NameWrapper>

        <Box style={{ display: "flex", gap: "6px" }}>
            {data.basic_info.category && (
                <Text color="#00838a" weight="bold">{data.basic_info.category}</Text>
              )}
            {data.basic_info.grade && (
              <Badge $bgColor="#eef6f7" $textColor="#00838a">{data.basic_info.grade}</Badge>
            )}
        </Box>
          <Row>
            <Text>{data.basic_info.experience_total}</Text>
            {" · "}
            <Text>{birthYear != null ? `${birthYear}년생 (만 ${age}세)` : EMPTY_VALUE}</Text>
          </Row>
        </UserInfo>

        <StarButton onClick={handleStarClick} $active={isFavorite} title={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}>
          <Icon name="Star" color={isFavorite ? "#f5a623" : "var(--color-icon-tertiary, #878a92)"} />
        </StarButton>
      </Header>

      <Divider />

      <CandidateDetailList details={data.details} />

      <IntroBox>
        <Intro>{data.introduction || "소개글이 없습니다."}</Intro>
      </IntroBox>
    </Card>
  );
};

const Card = styled.div`
  width: 100%;
  background-color: var(--color-bg-primary, #ffffff);
  border: 1px solid var(--color-border-muted, #e6e8ea);
  border-radius: var(--radius-xl, 16px);
  padding: var(--space-20, 20px);
  box-shadow: var(--shadow-2);
  position: relative;
  cursor: pointer;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;

  &:hover {
    box-shadow: var(--shadow-3);
    border-color: var(--color-border-secondary, #cbcfd2);
  }
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  gap: var(--space-12, 12px);
  margin-bottom: var(--space-16, 16px);
`;

const StarButton = styled.button<{ $active: boolean }>`
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  border-radius: var(--radius-sm, 6px);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.15s;

  &:hover {
    transform: scale(1.2);
  }

  &:active {
    transform: scale(0.95);
  }
`;


const UserInfo = styled.div`
  flex: 1;
  overflow: hidden;
`;

const NameWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Badge = styled.span<{ $bgColor?: string; $textColor?: string }>`
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 12px;
  background-color: ${({ $bgColor }) => $bgColor || "#eee"};
  color: ${({ $textColor }) => $textColor || "#333"};
  white-space: nowrap;
`;

const Divider = styled.hr`
  border: none;
  border-top: 1px solid var(--color-border-muted, #e6e8ea);
  margin: var(--space-16, 16px) 0;
`;


const IntroBox = styled.div`
  background-color: var(--color-bg-surface-primary, #f9f9fa);
  padding: var(--space-12, 12px) var(--space-16, 16px);
  border-radius: var(--radius-lg, 12px);
  margin-top: var(--space-4, 4px);
`;

const Intro = styled.p`
  font-size: var(--font-size-body-sm, 12px);
  color: var(--color-text-secondary, #6d7178);
  line-height: 1.6;

  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;

  overflow: hidden;
  margin: 0;
`;

export { CandidateCard };
