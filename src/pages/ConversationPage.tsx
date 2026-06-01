import {
  ContentInner,
  FixedBottom,
  FixedTop,
  Main,
  ScrollBody,
} from "../components/layouts";

import { useEffect, useRef } from "react";
import { useParams, Outlet } from "react-router-dom";
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
  const user = getUser();
  const { id: roomID } = useParams();
  const isAITyping = useIsMutating({ mutationKey: ["postChatAI"] }) > 0;

  const { candidateId } = useParams();
  const isCandidatePanelOpen = !!candidateId;

  const { conversation } = useConversation(roomID);
  const message = useConversationMessage();
  const response = useConversationResponse(message.mutate);
  const resumeUpload = useResumeUpload(roomID);

  const { prompt, handleChange, handleKeyDown, handleSubmit, handleFileDrop } =
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
        <ScrollBody ref={scrollRef}>
          <ContentInner size="wide">
            <FixedTop>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: "64px",
                }}
              >
                room id
              </div>
            </FixedTop>
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
