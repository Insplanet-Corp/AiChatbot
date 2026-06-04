import { useState, useCallback, ChangeEvent, KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { nanoid } from "nanoid";
import { useResumeUploader } from "./useResumeUploader";

interface MessagePayload {
  content: string;
  roomId: string;
  isUser: boolean;
}

interface UseChatSubmitProps {
  roomID?: string;
  user: { id: string };
  conversation: {
    mutateAsync: (args: { name: string; userId: string }) => Promise<{ id: string | number }>;
  };
  message: {
    mutate: (args: MessagePayload) => void;
  };
  response: {
    mutate: (args: { message: string; id: string; roomId: string; isUser: boolean }) => void;
  };
  resumeUpload: {
    isPending: boolean;
    isError: boolean;
    reset: () => void;
    mutate: (file: File, callbacks: { onSuccess: () => void; onError: () => void }) => void;
  };
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

  // 파일 업로드 관심사는 useResumeUploader 로 분리
  const { handleFileDrop, handleRetry, handleCancel, handleDismiss, uploadProgress, failedFiles, isUploading, currentFile, queuedFiles } =
    useResumeUploader(resumeUpload);

  return {
    prompt,
    setPrompt,
    handleKeyDown,
    handleSubmit,
    handleChange: (e: ChangeEvent<HTMLTextAreaElement>) =>
      setPrompt(e.target.value),
    handleFileDrop,
    handleRetry,
    handleCancel,
    handleDismiss,
    uploadProgress,
    failedFiles,
    isUploading,
    currentFile,
    queuedFiles,
  };
};
