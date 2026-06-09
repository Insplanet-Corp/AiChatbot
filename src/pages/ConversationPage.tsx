import { ContentInner, FixedBottom, Main, ScrollBody } from "../components/layouts";
import { useEffect, useRef, useState, useMemo } from "react";
import { useParams, Outlet } from "react-router-dom";
import styled from "styled-components";
import ConversationArea from "../components/ConversationArea";
import PromptInput from "../components/prompt/PromptInput";
import { useIsMutating } from "@tanstack/react-query";
import {
  useConversationResponse,
  useConversationMessage,
  useResumeUpload,
  useStartConversation,
} from "../hooks/queries";
import { useChatSubmit } from "../hooks/useChatSubmit";
import { getUser } from "../utils/getUser";
import { useConversation } from "../hooks/useConversation";
import { CHAT_SUGGESTIONS } from "../constants/service";

const ConversationPage = () => {
  const user = getUser();
  const { id: roomID, candidateId } = useParams();
  const isAITyping = useIsMutating({ mutationKey: ["postChatAI"] }) > 0;

  const { conversation: messages } = useConversation(roomID);
  const conversation = useStartConversation();
  const message = useConversationMessage();
  const response = useConversationResponse(message.mutate);
  const resumeUpload = useResumeUpload(roomID);

  const { prompt, setPrompt, handleChange, handleKeyDown, handleSubmit, submitQuery, handleFileDrop, handleRetry, handleCancel, handleDismiss, uploadProgress, failedFiles, isUploading, currentFile, queuedFiles } =
    useChatSubmit({
      roomID: roomID,
      user: user || { id: "" },
      conversation,
      message,
      response,
      resumeUpload,
    });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isTimedOut, setIsTimedOut] = useState(false);

  // 마지막 사용자 메시지 (재시도용)
  const lastUserQuery = useMemo(
    () => [...messages].reverse().find((m) => m.role === false)?.content || "",
    [messages],
  );

  // 5분 타임아웃: isAITyping이 true인 채로 5분이 지나면 timeout 표시
  useEffect(() => {
    if (isAITyping) {
      setIsTimedOut(false);
      timeoutRef.current = setTimeout(() => setIsTimedOut(true), 5 * 60 * 1000);
    } else {
      setIsTimedOut(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isAITyping]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isTimedOut]);

  return (
    <PageWrapper>
      <Main>
        <ScrollBody ref={scrollRef}>
          <ContentInner size="narrow">
            <ConversationArea
              messages={messages}
              isAITyping={isAITyping}
              isTimedOut={isTimedOut}
              lastQuery={lastUserQuery}
              onRetryQuery={submitQuery}
            />
          </ContentInner>
        </ScrollBody>

        <FixedBottom>
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
            currentFile={currentFile}
            queuedFiles={queuedFiles}
            suggestions={!roomID ? CHAT_SUGGESTIONS : undefined}
            onSuggestionClick={(val) => setPrompt(val)}
          />
        </FixedBottom>
      </Main>
      <Outlet />
    </PageWrapper>
  );
};

const PageWrapper = styled.div`
  display: flex;
  flex: 1;
  overflow: hidden;
  min-width: 0;
`;

export default ConversationPage;
