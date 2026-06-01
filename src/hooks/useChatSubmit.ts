import { useState, useCallback, ChangeEvent, KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { nanoid } from "nanoid";
import { useQueryClient } from "@tanstack/react-query";
import { parseAndSaveResume } from "../services/resumeService";

// 필요한 인터페이스 정의 (프로젝트 상황에 맞게 조정하세요)
interface UseChatSubmitProps {
  roomID?: string;
  user: { id: string };
  conversation: any; // useStartConversation의 결과 타입
  message: any; // useConversationMessage의 결과 타입
  response: any; // useConversationResponse의 결과 타입
  resumeUpload: any;
}

export const useChatSubmit = ({
  roomID,
  user,
  conversation,
  message,
  response,
  resumeUpload,
}: UseChatSubmitProps) => {
  const [prompt, setPrompt] = useState("");
  const navigate = useNavigate();

  const handleSubmit = useCallback(
    async (e?: React.FormEvent | React.KeyboardEvent) => {
      if (e) e.preventDefault();

      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt) return;

      // 1. 먼저 입력창을 비웁니다 (사용자 체감 속도 향상)
      setPrompt("");

      try {
        let currentRoomId = roomID;

        // 2. roomID가 없으면 새 대화방 생성
        if (!currentRoomId) {
          const newConversation = await conversation.mutateAsync({
            name: trimmedPrompt,
            userId: user.id,
          });
          currentRoomId = String(newConversation.id);
        }

        // 3. 메시지 전송 (사용자 메시지)
        message.mutate({
          content: trimmedPrompt,
          roomId: currentRoomId,
          isUser: false,
        });

        // 4. AI 답변 요청
        response.mutate({
          message: trimmedPrompt,
          id: nanoid(),
          roomId: currentRoomId || "",
          isUser: true,
        });

        // 5. 새 방이었다면 해당 경로로 이동
        if (!roomID && currentRoomId) {
          navigate(`/chat/${currentRoomId}`);
        }
      } catch (error) {
        console.error("채팅 처리 중 오류 발생:", error);
        alert("오류가 발생했습니다. 다시 시도해주세요.");
        // 에러 발생 시 사용자가 쓴 글을 복구하고 싶다면: setPrompt(trimmedPrompt);
      }
    },
    [prompt, roomID, user.id, conversation, message, response, navigate],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLFormElement>) => {
      if (e.nativeEvent.isComposing) return;
      if (e.key === "Enter" && !e.shiftKey) {
        handleSubmit(e);
      }
    },
    [handleSubmit],
  );

  const [lastDroppedFile, setLastDroppedFile] = useState<File | null>(null);

  const handleFileDrop = useCallback(
    async (file: File) => {
      setLastDroppedFile(file);
      resumeUpload.reset();
      resumeUpload.mutate(file);
    },
    [resumeUpload],
  );

  const handleRetry = useCallback(() => {
    if (!lastDroppedFile) return;
    resumeUpload.reset();
    resumeUpload.mutate(lastDroppedFile);
  }, [lastDroppedFile, resumeUpload]);

  return {
    prompt,
    setPrompt,
    handleKeyDown,
    handleSubmit,
    handleChange: (e: ChangeEvent<HTMLTextAreaElement>) =>
      setPrompt(e.target.value),
    handleFileDrop,
    handleRetry,
  };
};
