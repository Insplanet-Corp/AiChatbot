import { ContentInner, FixedTop, Main } from "../components/layouts";
import Spacer from "../components/Spacer";
import Text from "../components/common/text/Text";
import PromptInput from "../components/prompt/PromptInput";
import styled from "styled-components";

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

  const { prompt, handleChange, handleKeyDown, handleSubmit, handleFileDrop } =
    useChatSubmit({
      roomID: undefined,
      user,
      conversation,
      message,
      response,
      resumeUpload,
    });

  return (
    <Main>
      <ContentInner size="wide">
        <FixedTop>
          <Text variant="headingSm" weight="bold" as="h2">
            RING CHAT
          </Text>
        </FixedTop>
      </ContentInner>
      <CenterWrapper>
        <TitleContainer>
          <Text variant="headingLg" weight="bold">
            어떤 인재를 찾으시나요?
          </Text>
          <Spacer size={4} />
          <Text variant="bodyMd" weight="medium">
            AI가 수천 명의 전문가 중 당신의 팀에 가장 완벽한 인재를 단 몇 초
            만에 제안해 드립니다.
          </Text>
        </TitleContainer>
        <PromptInput
          value={prompt}
          setPrompt={handleChange}
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
          onFileDrop={handleFileDrop}
          isUploading={resumeUpload.isPending}
        />
      </CenterWrapper>
    </Main>
  );
};

const CenterWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: auto;
  width: 100%;
  max-width: 800px;
`;

const TitleContainer = styled.div`
  text-align: center;
  margin-bottom: 56px;
`;

export default HomePage;
