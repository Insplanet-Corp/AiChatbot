import {
  ContentInner,
  FixedBottom,
  FixedTop,
  Main,
  ScrollBody,
} from "../components/layouts";

import { useEffect, useRef } from "react";
import { useParams, Outlet, useNavigate, useLocation } from "react-router-dom";
import styled from "styled-components";
import ConversationArea from "../components/ConversationArea";
import PromptInput from "../components/prompt/PromptInput";
import { useIsMutating } from "@tanstack/react-query";
import {
  useConversationResponse,
  useConversationMessage,
  useResumeUpload,
} from "../hooks/queries";
import { useChatSubmit } from "../hooks/useChatSubmit";
import { getUser } from "../utils/getUser";
import { useConversation } from "../hooks/useConversation";

const ConversationPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  const { id: roomID } = useParams();
  const isAITyping = useIsMutating({ mutationKey: ["postChatAI"] }) > 0;

  const { candidateId } = useParams();
  const isCandidatePanelOpen = !!candidateId;

  const { conversation } = useConversation(roomID);
  const message = useConversationMessage();
  const response = useConversationResponse(message.mutate);
  const resumeUpload = useResumeUpload(roomID);

  const { prompt, handleChange, handleKeyDown, handleSubmit, handleFileDrop, handleRetry } =
    useChatSubmit({
      roomID: roomID,
      user: user || { id: "" },
      conversation: conversation,
      message,
      response,
      resumeUpload,
    });

  // 메시지가 추가될 때마다 스크롤이 가장 아래로 이동하도록 설정
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [conversation]);

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        gap: "1rem",
        overflow: "hidden",
      }}
    >
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
        <ScrollBody ref={scrollRef}>
          <ContentInner size="wide">
            <ConversationArea messages={conversation} isAITyping={isAITyping} />
          </ContentInner>
        </ScrollBody>
        <FixedBottom>
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
          {/* <Suggestions>
            {[
              "신한은행 파견 근무를 위한 퍼블리셔는 어떤 역량이 필요해?",
              "오늘 서울 날씨 어때?",
              "센트럴에쓰 근처의 점심 식당 추천해줘.",
            ].map((suggestion) => (
              <Suggestion key={suggestion}>{suggestion}</Suggestion>
            ))}
          </Suggestions> */}
        </FixedBottom>
      </Main>
      <Outlet />
    </div>
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

const Suggestions = ({ children }: { children: React.ReactNode }) => {
  return <div className="suggestions">{children}</div>;
};

const Suggestion = ({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) => {
  return (
    <button className="suggestion" onClick={onClick}>
      {children}
    </button>
  );
};

export default ConversationPage;
