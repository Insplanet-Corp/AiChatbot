import React from "react";
import styled from "styled-components";
import Text from "./common/text/Text";

interface Details {
  final_education?: string;
  qualifications?: string[];
  major_experience?: string;
  skills?: string[];
  internal_rating?: number;
}

interface CandidateDetailListProps {
  details?: Details;
}

interface DetailRowItemProps {
  label: string;
  children: React.ReactNode;
}

const renderStars = (rating?: number) => {
  if (!rating) return "-";
  return "★".repeat(Math.floor(rating)) + "☆".repeat(5 - Math.floor(rating));
};

const DetailRowItem = ({ label, children }: DetailRowItemProps) => (
  <DetailRow>
    <Text variant="labelMd" color="var(--color-text-tertiary, #878a92)">
      {label}
    </Text>
    {children}
  </DetailRow>
);

const CandidateDetailList = ({ details }: CandidateDetailListProps) => (
  <DetailList>
    <DetailRowItem label="최종학력">
      <Text variant="labelMd" color="var(--color-text-primary)">{details?.final_education || "-"}</Text>
    </DetailRowItem>

    <DetailRowItem label="경력사항">
      <Text variant="labelMd" color="var(--color-text-primary)">{details?.major_experience || "-"}</Text>
    </DetailRowItem>

    <DetailRowItem label="보유자격">
      <Text variant="labelMd" color="var(--color-text-primary)">
        {details?.qualifications?.length
          ? details.qualifications.join(", ")
          : "-"}
      </Text>
    </DetailRowItem>

    <DetailRowItem label="보유기술">
      <SkillContainer>
        {details?.skills?.slice(0, 3).map((skill, idx) => (
          <SkillTag key={idx}>{skill}</SkillTag>
        ))}
        {details?.skills?.length > 3 && <SkillTag>...</SkillTag>}
      </SkillContainer>
    </DetailRowItem>

    <DetailRowItem label="내부평가">
      {renderStars(details?.internal_rating)}
    </DetailRowItem>
  </DetailList>
);

const DetailList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 14px;
  margin-bottom: 20px;
`;

const DetailRow = styled.div`
  display: flex;
  gap: 12px;

  & > :first-child {
    flex-shrink: 0;
    width: 52px;
  }
`;

const Value = styled.span`
  flex: 1;
  min-width: 0;

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

export { CandidateDetailList };
