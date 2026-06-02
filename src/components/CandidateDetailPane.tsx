import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { useState } from "react";
import { SERVICE_NAME } from "../constants/service";
import { supabase } from "../utils/supabase";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAndDecryptCandidate } from "../services/candidateService";
import { downloadResumeDocx } from "../services/resumeDownloadService";
import { useTextArea } from "./common/Input/hooks";
import IconButton from "./common/button/IconButton";
import Icon from "./common/Icon/Icon";
import Text from "./common/text/Text";
import AreaInput from "./common/Input/AreaInput";
import Button from "./common/button/Button";
import { Avatar } from "./common/avatar";
import styled from "styled-components";
import { motion } from "framer-motion";
import { scrollbarStyle } from "./layouts";
import RadioGroup, { useRadioGroup } from "./common/radio-group";
import { getUser } from "../utils/getUser";
import Box from "./common/flex/box";

const RATING_OPTIONS = [
  { label: "★☆☆☆☆", value: 1 },
  { label: "★★☆☆☆", value: 2 },
  { label: "★★★☆☆", value: 3 },
  { label: "★★★★☆", value: 4 },
  { label: "★★★★★", value: 5 },
];

const CandidateDetailPane = () => {
  const { candidateId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = getUser();

  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!data || isDownloading) return;
    setIsDownloading(true);
    try {
      await downloadResumeDocx(data.name, data.rawResumeData, data.totalExperienceMonths);
    } catch (e) {
      console.error("이력서 다운로드 실패:", e);
      alert("이력서 다운로드에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setIsDownloading(false);
    }
  };

  const { value: newComment, onChange, setValue } = useTextArea("");
  const {
    value: rating,
    onChange: onRatingChange,
    setValue: setRating,
  } = useRadioGroup("0");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["candidate", candidateId],
    queryFn: () => fetchAndDecryptCandidate(candidateId as string),
    enabled: !!candidateId,
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["candidate_comments", candidateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resume_comments")
        .select("*")
        .eq("resume_id", candidateId)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!candidateId,
  });

  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const { data, error } = await supabase
        .from("resume_comments")
        .insert([
          {
            resume_id: candidateId,
            author: user.name,
            content: content,
          },
        ])
        .select();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["candidate_comments", candidateId],
      });
      setValue("");
    },
  });

  const updateRatingMutation = useMutation({
    mutationFn: async (newRating: number) => {
      const { error } = await supabase
        .from("resumes")
        .update({ rating: newRating })
        .eq("id", candidateId);

      if (error) throw new Error(error.message);
    },
  });

  const handleCommentSubmit = () => {
    if (!newComment.trim()) return;
    addCommentMutation.mutate(newComment);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleCommentSubmit();
    }
  };

  const handleRatingChange = (newRatingStr: string) => {
    const newRatingNum = Number(newRatingStr);

    queryClient.setQueryData(["candidate", candidateId], (oldData: any) => ({
      ...oldData,
      rating: newRatingNum,
    }));

    updateRatingMutation.mutate(newRatingNum);
  };

  if (isLoading) {
    return (
      <Overlay onClick={() => navigate("..")}>
        <PaneWrapper onClick={(e) => e.stopPropagation()} style={{ justifyContent: "center", alignItems: "center" }}>
          <h2>데이터를 불러오는 중입니다...</h2>
        </PaneWrapper>
      </Overlay>
    );
  }

  if (isError || !data) {
    return (
      <Overlay onClick={() => navigate("..")}>
        <PaneWrapper onClick={(e) => e.stopPropagation()} style={{ justifyContent: "center", alignItems: "center" }}>
          <h2>데이터를 불러오는데 실패했습니다.</h2>
          <button onClick={() => navigate("..")}>돌아가기</button>
        </PaneWrapper>
      </Overlay>
    );
  }

  return (
    <Overlay onClick={() => navigate("..")}>
    <motion.div
      initial={{ opacity: 0, scale: 0.9, x: 0 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.9, x: 0 }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 25,
      }}
      style={{ width: "100%", maxWidth: 1000 }}
      onClick={(e) => e.stopPropagation()}
    >
      <PaneWrapper>
        <Header>
          <Text variant="headingSm" weight="bold">
            {data.name}
          </Text>
          <IconButton style="ghost" onClick={() => navigate("..")}>
            <Icon name="CloseL" />
          </IconButton>
        </Header>

        <ContentArea>
          <ProfileCard>
            <Avatar
              style="photo"
              src={data.profileImage}
              alt={data.name}
              size={120}
              seed={data.name}
            />
            <Text variant="headingSm" weight="bold">
              {data.name}
            </Text>
            <Text variant="bodyMd" weight="medium" color="#00838A">
              <span>{data.experience}</span> · {data.age}
            </Text>
            <InfoBox>
              <InfoItem>{data.phone}</InfoItem>
              <InfoItem>{data.email}</InfoItem>
              <InfoItem>{data.address}</InfoItem>
            </InfoBox>

            <DownloadButton
              onClick={handleDownload}
              disabled={isDownloading}
            >
              {isDownloading ? "생성 중..." : "⬇ 이력서 다운로드"}
            </DownloadButton>
          </ProfileCard>

          <DetailCard>
            <Section>
              <Text variant="headingXs" weight="bold">
                {SERVICE_NAME} 요약평 ✨
              </Text>
              <AISummaryBox>
                <SummaryTextWrapper>
                  <Text variant="bodyMd" weight="medium" color="#6D7178">
                    {data.aiSummary}
                  </Text>
                </SummaryTextWrapper>
              </AISummaryBox>
            </Section>

            <Section>
              <Text variant="headingXs" weight="bold">
                기술
              </Text>
              <Box gap={12}>
                <Row>
                  <TagList>
                    {data.skills.languages.map((skill) => (
                      <Tag key={skill}>{skill}</Tag>
                    ))}
                  </TagList>
                </Row>
                <Row>
                  <TagList>
                    {data.skills.frameworks.map((skill) => (
                      <Tag key={skill}>{skill}</Tag>
                    ))}
                  </TagList>
                </Row>
              </Box>
            </Section>

            <Section>
              <Text variant="headingXs" weight="bold">
                근무이력
              </Text>
              <div>
                {data.workHistory.map((work, idx) => (
                  <Row key={idx}>
                    <div style={{width: '148px'}}>
                      <Text variant="bodyMd" weight="medium" color="#6D7178">
                        {work.period}
                      </Text>
                    </div>
                    <RowContent>
                      {work.company} <span>· {work.role}</span>
                    </RowContent>
                  </Row>
                ))}
              </div>
            </Section>

            <Section>
              <Text variant="headingXs" weight="bold">
                주요경력
              </Text>
              <div>
                {data.majorExperience.map((exp, idx) => (
                  <Row key={idx}>
                    <Text variant="bodyMd" weight="medium" color="#6D7178">
                      {exp.period}
                    </Text>

                    <RowContent>
                      {exp.project} <span>· {exp.role}</span>
                    </RowContent>
                  </Row>
                ))}
              </div>
            </Section>

            <Section>
              <Text variant="headingXs" weight="bold">
                평점 및 코멘트
              </Text>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  marginBottom: "8px",
                }}
              >
                <RadioGroup
                  name="candidate-rating"
                  value={data.rating}
                  options={RATING_OPTIONS}
                  onChange={handleRatingChange}
                  size="small"
                />
              </div>

              <CommentContainer>
                <CommentInputWrapper>
                  <AreaInput
                    variant="outline"
                    placeholder="후보자에 대한 평가나 메모를 남겨주세요."
                    value={newComment}
                    onChange={onChange}
                    onKeyDown={handleKeyDown}
                  />

                  <div style={{ alignSelf: "flex-end" }}>
                    <Button
                      onClick={handleCommentSubmit}
                      state={
                        !newComment.trim() || addCommentMutation.isPending
                          ? "disabled"
                          : "default"
                      }
                    >
                      {addCommentMutation.isPending ? "등록 중..." : "등록"}
                    </Button>
                  </div>
                </CommentInputWrapper>

                <CommentList>
                  {comments.map((comment) => (
                    <CommentItem key={comment.id}>
                      <CommentHeader>
                        <Text variant="bodyMd">{comment.author}</Text>
                        <Text variant="bodySm" color="#9ca3af">
                          {new Date(comment.created_at).toLocaleDateString(
                            "ko-KR",
                          )}
                        </Text>
                      </CommentHeader>
                      <Text variant="bodyMd">{comment.content}</Text>
                    </CommentItem>
                  ))}
                </CommentList>
              </CommentContainer>
            </Section>
          </DetailCard>
        </ContentArea>
      </PaneWrapper>
    </motion.div>
    </Overlay>
  );
};

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
`;

const PaneWrapper = styled.aside`
  width: 100%;
  max-width: 1000px;
  max-height: 90vh;
  background-color: var(--color-bg-primary, #ffffff);
  border: 1px solid var(--color-border-muted, #e6e8ea);
  border-radius: var(--radius-xl, 16px);
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-3);
  overflow: hidden;
`;

const SummaryTextWrapper = styled.div`
  flex: 1;
  max-width: 400px;
  min-width: 0;
  word-break: keep-all;
  white-space: pre-wrap;
  line-height: 1.6;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-16, 16px);
  border-bottom: 1px solid var(--color-border-muted, #e6e8ea);
`;

const ContentArea = styled.div`
  display: flex;
  gap: 20px;
  padding: 24px;
  flex: 1;
  overflow: hidden;

  @media (max-width: 1800px) {
    flex-direction: column;
    padding: 16px;
  }
`;

const ProfileCard = styled.div`
  width: 280px;
  background-color: var(--color-bg-surface-primary, #f9f9fa);
  border-radius: var(--radius-xl, 16px);
  border: 1px solid var(--color-border-muted, #e6e8ea);
  padding: var(--space-24, 24px) var(--space-20, 20px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-8, 8px);

  @media (max-width: 1800px) {
    width: 100%;
    padding: var(--space-16, 16px) 0;
  }
`;


const InfoBox = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: auto;

  @media (max-width: 1800px) {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
  }
`;

const InfoItem = styled.div`
  display: flex;
  align-items: center;
  background-color: var(--color-bg-primary, #ffffff);
  border: 1px solid var(--color-border-muted, #e6e8ea);
  padding: var(--space-8, 8px) var(--space-12, 12px);
  border-radius: var(--radius-md, 8px);
  font-size: var(--font-size-caption-md, 12px);
  color: var(--color-text-secondary, #6d7178);
  gap: var(--space-8, 8px);
`;

const DetailCard = styled.div`
  flex: 1;
  background-color: var(--color-bg-primary, #ffffff);
  border-radius: var(--radius-xl, 16px);
  border: 1px solid var(--color-border-muted, #e6e8ea);
  padding: var(--space-24, 24px);
  display: flex;
  flex-direction: column;
  gap: var(--space-32, 32px);
  overflow-y: auto;

  ${scrollbarStyle};

  @media (max-width: 1800px) {
    padding: var(--space-16, 16px);
    gap: var(--space-24, 24px);
  }
`;

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const AISummaryBox = styled.div`
  display: flex;
  gap: 24px;
  align-items: flex-start;
  justify-content: space-between;
`;

const ScoreBox = styled.div`
  width: 140px;
  background-color: var(--color-bg-surface-primary, #f9f9fa);
  border: 1px solid var(--color-border-muted, #e6e8ea);
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-16, 16px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-8, 8px);
  flex-shrink: 0;
`;

const ScoreValue = styled.div`
  font-size: 28px;
  font-weight: var(--font-weight-bold, 700);
  color: var(--color-text-emphasis, #181a1b);
`;

const ProgressBarWrapper = styled.div`
  width: 100%;
  height: 6px;
  background-color: var(--color-bg-surface-secondary, #e6e8ea);
  border-radius: var(--radius-full, 999px);
  overflow: hidden;
`;

const ProgressBar = styled.div<{ $percent: number }>`
  width: ${(props) => props.$percent}%;
  height: 100%;
  background-color: var(--color-text-brand-primary, #4949d4);
`;

const Row = styled.div`
  display: flex;
  border-bottom: 1px solid var(--color-border-muted, #e6e8ea);

  &:last-child {
    border-bottom: none;
  }
`;

const RowContent = styled.div`
  flex: 1;
  font-size: var(--font-size-label-md, 14px);
  color: var(--color-text-primary, #3c3e44);

  span {
    color: var(--color-text-tertiary, #878a92);
    margin-left: var(--space-8, 8px);
    font-size: var(--font-size-caption-md, 12px);
  }
`;

const TagList = styled.div`
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-8, 8px);
`;

const Tag = styled.span`
  background-color: var(--color-bg-secondary, #f1f2f4);
  color: var(--color-text-secondary, #6d7178);
  padding: 3px var(--space-8, 8px);
  border-radius: var(--radius-xs, 4px);
  font-size: var(--font-size-caption-md, 12px);
  font-weight: var(--font-weight-medium, 500);
`;

const CommentContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-16, 16px);
  background-color: var(--color-bg-surface-primary, #f9f9fa);
  padding: var(--space-16, 16px);
  border-radius: var(--radius-lg, 12px);
  border: 1px solid var(--color-border-muted, #e6e8ea);
`;

const CommentInputWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-12, 12px);
`;

const CommentList = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-12, 12px);
`;

const CommentItem = styled.div`
  background-color: var(--color-bg-primary, #ffffff);
  padding: var(--space-12, 12px) var(--space-16, 16px);
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--color-border-muted, #e6e8ea);
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 4px);
`;

const CommentHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const DownloadButton = styled.button`
  width: 100%;
  margin-top: 4px;
  padding: 10px 0;
  background-color: var(--color-bg-solid-brand, #4949d4);
  color: #ffffff;
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: var(--font-size-label-md, 14px);
  font-weight: var(--font-weight-semibold, 600);
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;

  &:hover:not(:disabled) {
    background-color: #3737b8;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

export { CandidateDetailPane };
