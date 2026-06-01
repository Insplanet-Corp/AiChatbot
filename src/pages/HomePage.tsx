import { Main } from "../components/layouts";
import Spacer from "../components/Spacer";
import Text from "../components/common/text/Text";
import PromptInput from "../components/prompt/PromptInput";
import styled from "styled-components";
import { SERVICE_NAME } from "../constants/service";

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

  if (!user) {
    alert("test :: user로 로그인 후 이용 가능합니다.");
    return null;
  }

  const conversation = useStartConversation();
  const message = useConversationMessage();
  const response = useConversationResponse(message.mutate);
  const resumeUpload = useResumeUpload();

  const { prompt, handleChange, handleKeyDown, handleSubmit, handleFileDrop, handleRetry } =
    useChatSubmit({
      roomID: undefined,
      user,
      conversation,
      message,
      response,
      resumeUpload,
    });

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
          isUploading={resumeUpload.isPending}
          uploadError={resumeUpload.isError}
          onRetry={handleRetry}
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
