import { Main } from "../components/layouts";
import Text from "../components/common/text/Text";
import PromptInput from "../components/prompt/PromptInput";
import styled from "styled-components";
import { CHAT_SUGGESTIONS } from "../constants/service";

import {
  useStartConversation,
  useConversationMessage,
  useConversationResponse,
  useResumeUpload,
} from "../hooks/queries";
import { getUser } from "../utils/getUser";
import { useChatSubmit } from "../hooks/useChatSubmit";

const HomePage = () => {
  const user = getUser();
  const conversation = useStartConversation();
  const message = useConversationMessage();
  const response = useConversationResponse(message.mutate);
  const resumeUpload = useResumeUpload();

  const { prompt, setPrompt, handleChange, handleKeyDown, handleSubmit, handleFileDrop, handleRetry, handleCancel, handleDismiss, uploadProgress, failedFiles, isUploading } =
    useChatSubmit({
      roomID: undefined,
      user: user ?? { id: "" },
      conversation,
      message,
      response,
      resumeUpload,
    });

  if (!user) {
    return null;
  }

  return (
    <HomeMain>
      <CenterContent>
        <TitleBlock>
          <Text variant="headingLg" weight="bold">
            딱 맞는 인재, 지금 바로 찾아보세요
          </Text>
          <Text variant="bodyMd" color="var(--color-text-secondary, #6d7178)">
            사내 인재 풀에서 조건에 맞는 적임자를 빠르게 찾아드립니다.
          </Text>
        </TitleBlock>
        <PromptInput
          value={prompt}
          setPrompt={handleChange}
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
          onFileDrop={handleFileDrop}
          isUploading={isUploading}
          failedFiles={failedFiles}
          uploadProgress={uploadProgress}
          onRetry={handleRetry}
          onCancel={handleCancel}
          onDismiss={handleDismiss}
          suggestions={CHAT_SUGGESTIONS}
          onSuggestionClick={(val) => setPrompt(val)}
        />
      </CenterContent>
    </HomeMain>
  );
};

const HomeMain = styled(Main)`
  justify-content: center;
  align-items: center;
`;

const CenterContent = styled.div`
  width: 100%;
  max-width: 720px;
  padding: 0 var(--space-24, 24px);

  @media (max-width: 640px) {
    padding: 0 var(--space-16, 16px);
  }
`;

const TitleBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  text-align: center;
  margin-bottom: 48px;

  @media (max-width: 640px) {
    margin-bottom: 32px;
  }
`;

export default HomePage;
