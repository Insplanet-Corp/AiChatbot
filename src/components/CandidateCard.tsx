import React from "react";
import styled from "styled-components";
import Text from "./common/text/Text";
import Icon from "./common/Icon/Icon";
import { Avatar } from "./common/avatar";

const renderStars = (rating) => {
  if (!rating) return "-";
  const fullStars = "★".repeat(Math.floor(rating));
  const emptyStars = "☆".repeat(5 - Math.floor(rating));
  return fullStars + emptyStars;
};

const CandidateCard = ({ data, onClick, isFavorite = false, onToggleFavorite }) => {
  if (!data || !data.basic_info) return null;

  const currentYear = 2026;
  const age = currentYear - data.basic_info.birth_year;

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
            {data.details?.internal_rating >= 4.0 && (
              <Badge bgColor="#F6F2FE" textColor="#8337ED">
                ✓ BEST
              </Badge>
            )}
            {data.is_kosa_verified && (
              <Badge bgColor="#D6F9FA" textColor="#00838A">
                코사증빙
              </Badge>
            )}
          </NameWrapper>

          <MetaInfo>
            {data.basic_info.category && (
              <span className="category">{data.basic_info.category}</span>
            )}
            {" · "}
            {data.basic_info.experience_total}
            {" · "}
            {data.basic_info.birth_year}년생 (만 {age}세)
          </MetaInfo>
        </UserInfo>

        <StarButton onClick={handleStarClick} $active={isFavorite} title={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}>
          <Icon name="Star" color={isFavorite ? "#f5a623" : "var(--color-icon-tertiary, #878a92)"} />
        </StarButton>
      </Header>

      <Divider />

      <DetailList>
        <DetailRow>
          <Text variant="labelSm" color="var(--color-text-tertiary, #878a92)">
            최종학력
          </Text>
          <Value>{data.details?.final_education || "-"}</Value>
        </DetailRow>

        <DetailRow>
          <Text variant="labelSm" color="var(--color-text-tertiary, #878a92)">
            보유자격
          </Text>
          <Value>
            {data.details?.qualifications?.length > 0
              ? data.details.qualifications.join(", ")
              : "-"}
          </Value>
        </DetailRow>

        <DetailRow>
          <Text variant="labelSm" color="var(--color-text-tertiary, #878a92)">
            경력사항
          </Text>
          <Value className="truncate">
            {data.details?.major_experience || "-"}
          </Value>
        </DetailRow>

        <DetailRow>
          <Text variant="labelSm" color="var(--color-text-tertiary, #878a92)">
            보유기술
          </Text>
          <SkillContainer>
            {data.details?.skills?.slice(0, 3).map((skill, idx) => (
              <SkillTag key={idx}>{skill}</SkillTag>
            ))}
            {data.details?.skills?.length > 3 && <SkillTag>...</SkillTag>}
          </SkillContainer>
        </DetailRow>

        <DetailRow>
          <Text variant="labelSm" color="var(--color-text-tertiary, #878a92)">
            내부평가
          </Text>
          <Value className="rating">
            {renderStars(data.details?.internal_rating)}
          </Value>
        </DetailRow>
      </DetailList>

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
  margin-bottom: 4px;
`;

const Badge = styled.span<{ bgColor?: string; textColor?: string }>`
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 12px;
  background-color: ${({ bgColor }) => bgColor || "#eee"};
  color: ${({ textColor }) => textColor || "#333"};
  white-space: nowrap;
`;

const MetaInfo = styled.div`
  font-size: var(--font-size-label-sm, 12px);
  color: var(--color-text-secondary, #6d7178);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  .category {
    color: #00838a;
    font-weight: var(--font-weight-semibold, 600);
  }
`;

const Divider = styled.hr`
  border: none;
  border-top: 1px solid var(--color-border-muted, #e6e8ea);
  margin: var(--space-16, 16px) 0;
`;

const DetailList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 14px;
  margin-bottom: 20px;
`;

const DetailRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;

  & > :first-child {
    flex-shrink: 0;
    width: 52px;
  }
`;

const Value = styled.span`
  flex: 1;
  color: var(--color-text-emphasis, #181a1b);
  font-weight: var(--font-weight-medium, 500);
  min-width: 0;
  font-size: var(--font-size-label-md, 14px);

  &.truncate {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &.rating {
    font-size: var(--font-size-body-lg, 16px);
    color: var(--color-text-primary, #3c3e44);
    letter-spacing: 2px;
  }
`;

const SkillContainer = styled.div`
  display: flex;
  gap: var(--space-4, 4px);
  flex-wrap: wrap;
  flex: 1;
`;

const SkillTag = styled.span`
  background-color: var(--color-bg-secondary, #f1f2f4);
  color: var(--color-text-secondary, #6d7178);
  font-size: var(--font-size-caption-md, 12px);
  font-weight: var(--font-weight-medium, 500);
  padding: 2px 6px;
  border-radius: var(--radius-xs, 4px);
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
