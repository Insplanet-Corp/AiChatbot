import { ContentInner, FixedTop, Main } from "../components/layouts";
import Spacer from "../components/Spacer";
import Text from "../components/common/text/Text";
import PromptInput from "../components/prompt/PromptInput";
import styled from "styled-components";
import { SERVICE_NAME } from "../constants/service";
import { useNavigate, useLocation } from "react-router-dom";

import {
  useStartConversation,
  useConversationMessage,
  useConversationResponse,
  useResumeUpload,
} from "../hooks/queries";
import { getUser } from "../utils/getUser";
import { useChatSubmit } from "../hooks/useChatSubmit";

const HomePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
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
    <Main>
      <FixedTop>
        <TopNav>
          <NavTab
            active={location.pathname.startsWith("/chat")}
            onClick={() => navigate("/chat")}
          >
            인력 찾기
          </NavTab>
          <NavTab
            active={location.pathname.startsWith("/candidates")}
            onClick={() => navigate("/candidates")}
          >
            인력 프로필
          </NavTab>
        </TopNav>
      </FixedTop>
      <CenterWrapper>
        <TitleContainer>
          <Text variant="headingLg" weight="bold">
            어떤 인재를 찾으시나요?
          </Text>
          <Spacer size={4} />
          <Text variant="bodyMd" weight="medium">
            {SERVICE_NAME}이 수천 명의 전문가 중 당신의 팀에 가장 완벽한 인재를 단 몇 초
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
          uploadError={resumeUpload.isError}
          onRetry={handleRetry}
        />
      </CenterWrapper>
    </Main>
  );
};

const TopNav = styled.nav`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 2rem;
  border-bottom: 1px solid #eee;
  background: #fff;
`;

const NavTab = styled.button<{ active?: boolean }>`
  padding: 14px 20px;
  font-size: 14px;
  font-weight: ${({ active }) => (active ? 600 : 400)};
  color: ${({ active }) => (active ? "#1a1a1a" : "#878a92")};
  background: none;
  border: none;
  border-bottom: 2px solid ${({ active }) => (active ? "#1a1a1a" : "transparent")};
  cursor: pointer;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;

  &:hover {
    color: #1a1a1a;
  }
`;

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
