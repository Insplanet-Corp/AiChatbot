import { ContentInner, FixedBottom, Main, ScrollBody } from "../components/layouts";
import { useEffect, useRef } from "react";
import { useParams, Outlet } from "react-router-dom";
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
import { CHAT_SUGGESTIONS } from "../constants/service";

const ConversationPage = () => {
  const user = getUser();
  const { id: roomID, candidateId } = useParams();
  const isAITyping = useIsMutating({ mutationKey: ["postChatAI"] }) > 0;

  const { conversation } = useConversation(roomID);
  const message = useConversationMessage();
  const response = useConversationResponse(message.mutate);
  const resumeUpload = useResumeUpload(roomID);

  const { prompt, setPrompt, handleChange, handleKeyDown, handleSubmit, handleFileDrop, handleRetry, uploadProgress } =
    useChatSubmit({
      roomID: roomID,
      user: user || { id: "" },
      conversation: conversation,
      message,
      response,
      resumeUpload,
    });

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
    <PageWrapper>
      <Main>
        <ScrollBody ref={scrollRef}>
          <ContentInner size="narrow">
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
            uploadProgress={uploadProgress}
            onRetry={handleRetry}
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
