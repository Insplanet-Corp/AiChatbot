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

  const submitQuery = useCallback(
    async (queryText: string) => {
      const trimmedQuery = queryText.trim();
      if (!trimmedQuery) return;

      try {
        let currentRoomId = roomID;

        if (!currentRoomId) {
          const newConversation = await conversation.mutateAsync({
            name: trimmedQuery,
            userId: user.id,
          });
          currentRoomId = String(newConversation.id);
        }

        message.mutate({ content: trimmedQuery, roomId: currentRoomId, isUser: false });
        response.mutate({ message: trimmedQuery, id: nanoid(), roomId: currentRoomId || "", isUser: true });

        if (!roomID && currentRoomId) {
          navigate(`/chat/${currentRoomId}`);
        }
      } catch (error) {
        console.error("채팅 처리 중 오류 발생:", error);
        alert("오류가 발생했습니다. 다시 시도해주세요.");
      }
    },
    [roomID, user.id, conversation, message, response, navigate],
  );

  const handleSubmit = useCallback(
    async (e?: React.FormEvent | React.KeyboardEvent) => {
      if (e) e.preventDefault();
      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt) return;
      setPrompt("");
      await submitQuery(trimmedPrompt);
    },
    [prompt, submitQuery],
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
    submitQuery,
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
