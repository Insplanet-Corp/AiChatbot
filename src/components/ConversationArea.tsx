import { AIChatBubble, MyChatBubble } from "./domain/ChatBubble";
import { CandidateCard } from "./CandidateCard";
import ThinkingProcess from "./ThinkingProcess";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";

interface StructuredResponse {
  __type: "no_results" | "error";
  query: string;
  reason: string;
}

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

const getStructuredData = (content: unknown): StructuredResponse | null => {
  if (typeof content !== "string") return null;
  const trimmed = content.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.__type === "no_results" || parsed.__type === "error") {
      return parsed as StructuredResponse;
    }
  } catch {
    // ignore
  }
  return null;
};

const ConversationArea = ({
  messages,
  isAITyping,
  isTimedOut,
  lastQuery,
  onRetryQuery,
}: {
  messages: any[];
  isAITyping: boolean;
  isTimedOut?: boolean;
  lastQuery?: string;
  onRetryQuery?: (query: string) => void;
}) => {
  return (
    <Wrapper>
      {messages.map((mes) => {
        const isMine = mes.role == false;
        const structuredData = getStructuredData(mes.content);
        const candidatesArray = getCandidatesArray(mes.content);
        const hasCandidates = candidatesArray.length > 0;

        if (structuredData) {
          return (
            <NoResultsBlock
              key={mes.id}
              data={structuredData}
              onRetryQuery={onRetryQuery}
            />
          );
        }

        if (hasCandidates) {
          return (
            <CandidateResultBlock key={mes.id}>
              <AIChatBubble message={`해당 조건에 맞는 인력을 ${candidatesArray.length}명 찾았습니다.`} />
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

      {isAITyping && !isTimedOut && <ThinkingProcess />}
      {isTimedOut && (
        <TimeoutBlock query={lastQuery || ""} onRetry={onRetryQuery} />
      )}
    </Wrapper>
  );
};

const NoResultsBlock = ({
  data,
  onRetryQuery,
}: {
  data: StructuredResponse;
  onRetryQuery?: (query: string) => void;
}) => (
  <NoResultsWrapper>
    <AIChatBubble message={data.reason} />
    {onRetryQuery && data.query && (
      <RetryButton onClick={() => onRetryQuery(data.query)}>
        다시 검색하기
      </RetryButton>
    )}
  </NoResultsWrapper>
);

const TimeoutBlock = ({
  query,
  onRetry,
}: {
  query: string;
  onRetry?: (query: string) => void;
}) => (
  <NoResultsWrapper>
    <AIChatBubble
      message={`검색에 시간이 너무 오래 걸리고 있습니다.\n\n가능한 원인:\n• AI 서버 응답이 지연되고 있을 수 있습니다\n• 네트워크 연결을 확인해주세요\n\n잠시 후 다시 시도해주세요.`}
    />
    {onRetry && query && (
      <RetryButton onClick={() => onRetry(query)}>
        다시 검색하기
      </RetryButton>
    )}
  </NoResultsWrapper>
);

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

const CandidateGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-12, 12px);

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const NoResultsWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-12, 12px);
`;

const RetryButton = styled.button`
  align-self: flex-start;
  background: var(--color-bg-primary, #ffffff);
  border: 1px solid var(--color-primary, #00838a);
  color: var(--color-primary, #00838a);
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-8, 8px) var(--space-16, 16px);
  font-size: var(--font-size-body-sm, 12px);
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: var(--color-primary, #00838a);
    color: #ffffff;
  }
`;

export default ConversationArea;
