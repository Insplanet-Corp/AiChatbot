import styled from "styled-components";
import { Avatar } from "../common/avatar";
import Text from "../common/text/Text";

// -----------------------------------------
// 1. 내가 보낸 메시지
// -----------------------------------------
interface MyChatBubbleProps {
  message: any;
}

export const MyChatBubble: React.FC<MyChatBubbleProps> = ({ message }) => {
  return (
    <MyBaseBubble>
      <StyledMyBubble>
        <Text variant="bodyMd" weight="medium" color="var(--color-text-primary)">
          {message}
        </Text>
      </StyledMyBubble>
    </MyBaseBubble>
  );
};

// -----------------------------------------
// 2. 상대방이 보낸 메시지
// -----------------------------------------
interface OtherChatBubbleProps {
  sender?: string;
  avatar?: string;
  message: string;
  timestamp?: string;
}

export const OtherChatBubble: React.FC<OtherChatBubbleProps> = ({
  sender,
  message,
  timestamp,
}) => {
  return (
    <OtherBaseBubble>
      <Avatar style="icon" size={36} seed={sender} />
      <OtherContent>
        {sender && (
          <Text variant="labelSm" weight="semibold" color="var(--color-text-secondary)">
            {sender}
          </Text>
        )}
        <StyledOtherBubble>
          <Text variant="bodyMd" weight="regular" color="var(--color-text-primary)">
            {message}
          </Text>
        </StyledOtherBubble>
        {timestamp && (
          <Text variant="captionSm" color="var(--color-text-muted)">
            {timestamp}
          </Text>
        )}
      </OtherContent>
    </OtherBaseBubble>
  );
};

// -----------------------------------------
// 3. AI 메시지
// -----------------------------------------
export const AIChatBubble: React.FC<OtherChatBubbleProps> = ({ message }) => {
  return (
    <OtherBaseBubble>
      <AIContent>
        <StyledAIBubble>
          <Text variant="bodyMd" weight="medium" color="var(--color-text-primary)">
            {message}
          </Text>
        </StyledAIBubble>
      </AIContent>
    </OtherBaseBubble>
  );
};

// -----------------------------------------
// Styled Components
// -----------------------------------------

const MyBaseBubble = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  width: 100%;
`;

const OtherBaseBubble = styled.div`
  display: flex;
  align-items: flex-start;
  gap: var(--space-8, 8px);
  width: 100%;
`;

const OtherContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-4, 4px);
  max-width: calc(100% - 44px);
`;

const AIContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
`;

const BaseBubble = styled.div`
  max-width: min(508px, 85%);
  min-height: 40px;
  padding: var(--space-12, 12px) var(--space-16, 16px);
  box-sizing: border-box;
  word-break: break-word;
  line-height: 1.7;
`;

const StyledMyBubble = styled(BaseBubble)`
  background: var(--color-bg-surface-brand, #e2eafe);
  border: 1px solid var(--color-border-muted, #e6e8ea);
  border-radius: var(--radius-xl, 16px) var(--radius-xs, 4px)
    var(--radius-xl, 16px) var(--radius-xl, 16px);
`;

const StyledOtherBubble = styled(BaseBubble)`
  background: var(--color-bg-surface-secondary, #e6e8ea);
  border-radius: var(--radius-xs, 4px) var(--radius-xl, 16px)
    var(--radius-xl, 16px) var(--radius-xl, 16px);
`;

const StyledAIBubble = styled(BaseBubble)`
  max-width: 100%;
  background: var(--color-bg-surface-floating, #ffffff);
  border: 1px solid var(--color-border-muted, #e6e8ea);
  border-radius: var(--radius-xs, 4px) var(--radius-xl, 16px)
    var(--radius-xl, 16px) var(--radius-xl, 16px);
  box-shadow: var(--shadow-1);
`;
