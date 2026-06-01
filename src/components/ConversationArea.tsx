import { AIChatBubble, MyChatBubble } from "./domain/ChatBubble";
import { CandidateCard } from "./CandidateCard";
import ThinkingProcess from "./ThinkingProcess";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";

const getCandidatesArray = (content: unknown) => {
  if (typeof content !== "string") return [];
  const trimmed = content.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // 파싱 실패 시 일반 텍스트로 처리
    }
  }
  return [];
};

const ConversationArea = ({
  messages,
  isAITyping,
}: {
  messages: any[];
  isAITyping: boolean;
}) => {
  return (
    <Wrapper>
      {messages.map((mes) => {
        const isMine = mes.role == false;
        const candidatesArray = getCandidatesArray(mes.content);
        const hasCandidates = candidatesArray.length > 0;

        if (hasCandidates) {
          return (
            <CandidateResultBlock key={mes.id}>
              <ResultLabel>해당 조건에 맞는 인력을 {candidatesArray.length}명 찾았습니다.</ResultLabel>
              <CandidateGrid>
                {candidatesArray.map((item: any) => (
                  <CandidateCardWrapper key={item.id} item={item} />
                ))}
              </CandidateGrid>
            </CandidateResultBlock>
          );
        }

        return isMine ? (
          <MyChatBubble key={mes.id} message={mes.content} />
        ) : (
          <AIChatBubble key={mes.id} message={mes.content} />
        );
      })}

      {isAITyping && <ThinkingProcess />}
    </Wrapper>
  );
};

const CandidateCardWrapper = ({ item }: { item: any }) => {
  const navigate = useNavigate();
  return <CandidateCard data={item} onClick={() => navigate(`candidate/${item.id}`)} />;
};

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-16, 16px);
  padding: var(--space-24, 24px) 0;
`;

const CandidateResultBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-12, 12px);
`;

const ResultLabel = styled.span`
  font-size: var(--font-size-body-sm, 12px);
  color: var(--color-text-secondary, #6d7178);
`;

const CandidateGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-12, 12px);

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;


export default ConversationArea;
