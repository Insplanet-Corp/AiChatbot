import { SyncLoader } from "react-spinners";
import { AIChatBubble, MyChatBubble } from "./domain/ChatBubble";
import { CandidateCard } from "./CandidateCard";
import { useNavigate } from "react-router-dom";
import Box from "./common/flex/box";

const getCandidatesArray = (content: unknown) => {
  if (typeof content !== "string") return [];

  const trimmed = content.trim();

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (e) {
      // 파싱 실패 시 일반 텍스트로 처리 (빈 배열 반환)
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
    <Box gap="1rem">
      {messages.map((mes) => {
        const isMine = mes.role == false;
        let candidatesArray = getCandidatesArray(mes.content);
        const hasCandidates = candidatesArray.length > 0;

        if (hasCandidates) {
          return (
            <Box key={mes.id} gap="1rem">
              <span>
                해당 조건에 맞는 인력을 {candidatesArray.length}명 찾았습니다.
              </span>
              <CandidateList candidates={candidatesArray} />
            </Box>
          );
        }

        return isMine ? (
          <MyChatBubble key={mes.id} message={mes.content} />
        ) : (
          <AIChatBubble key={mes.id} message={mes.content} />
        );
      })}

      {isAITyping && (
        <Box style={{ padding: "var(--space-8, 8px)" }}>
          <SyncLoader
            color="var(--color-text-muted, #9b9fa6)"
            loading
            size={6}
            speedMultiplier={0.6}
          />
        </Box>
      )}
    </Box>
  );
};

const CandidateList = ({ candidates }: any) => {
  const navigate = useNavigate();
  return (
    <Box gap="1rem" direction="row" wrap>
      {candidates.map((item: any) => {
        const handleClick = (id: any) => {
          navigate(`candidate/${id}`);
        };
        return (
          <CandidateCard
            key={item.id}
            data={item}
            onClick={() => handleClick(item.id)}
          />
        );
      })}
    </Box>
  );
};

export default ConversationArea;
