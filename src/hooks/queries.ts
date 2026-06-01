import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nanoid } from "nanoid";
import {
  startConversation,
  createConversationMessage,
} from "../apis/conversation";
import { postChat } from "../services/chatService";
import { parseAndSaveResume } from "../services/resumeService";
import { supabase } from "../utils/supabase";

interface Message {
  id: string;
  is_user: boolean;
  content: string;
  status?: "done" | "pending" | "error";
  created_at?: string;
}

// const useCreateChatRoom = ({ createRoom, insertMessage, chatAI }: any) => {
//   const [message, setMessage] = useState("");
//   const navigate = useNavigate();

//   const handleSubmit = async (event?: React.FormEvent) => {
//     if (event) event.preventDefault();
//     if (!message.trim()) return;

//     const currentMessage = message;

//     try {
//       setMessage("");

//       const newRoom = await createRoom.mutateAsync({
//         name: currentMessage,
//       });

//       const newRoomId = String(newRoom.id);

//       insertMessage.mutate({
//         content: currentMessage,
//         roomId: newRoomId,
//       });

//       chatAI.mutate({
//         message: currentMessage,
//         id: nanoid(),
//         roomId: newRoomId,
//       });

//       navigate(`/${newRoomId}`);
//     } catch (error) {
//       console.error("채팅방 생성 또는 메시지 전송 실패:", error);

//       // 실패 시 복구
//       setMessage(currentMessage);
//       alert("오류가 발생했습니다. 다시 시도해주세요.");
//     }
//   };

//   const handleKeyDown = (event: React.KeyboardEvent) => {
//     if (event.nativeEvent.isComposing) return;

//     if (event.key === "Enter" && !event.shiftKey) {
//       event.preventDefault();
//       handleSubmit();
//     }
//   };

//   return {
//     message,
//     setMessage,
//     handleSubmit,
//     handleKeyDown,
//   };
// };

const useStartConversation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: startConversation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};

const useConversationMessage = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: createConversationMessage,
    onMutate: async (variables) => {
      const { roomId, content, isUser } = variables;

      await qc.cancelQueries({ queryKey: ["conversation", roomId] });
      const previousMessages = qc.getQueryData(["conversation", roomId]);

      // pending을 빼더라도 넣어야하는 이유. -> 말풍선을 먼저 그려줘야하기떄문.
      qc.setQueryData<Message[]>(["conversation", roomId], (old) => [
        ...(old || []),
        {
          id: nanoid(),
          content: content,
          is_user: isUser || false,
          status: "pending",
        },
      ]);

      return { previousMessages, roomId };
    },
    onError: (err, variables, context) => {
      qc.setQueryData(
        ["conversation", context?.roomId],
        context?.previousMessages,
      );
    },
    onSettled: (data, error, variables) => {
      qc.invalidateQueries({ queryKey: ["conversation", variables.roomId] });
    },
  });
};

const useConversationResponse = (createConversationResponseMutate: any) => {
  const qc = useQueryClient();

  return useMutation({
    mutationKey: ["postChatAI"],
    mutationFn: postChat,
    onSuccess: (data, variables) => {
      const text = data?.text ?? "";

      if (!text) {
        qc.setQueryData<Message[]>(["conversation", variables.roomId], (old) =>
          old?.filter((m) => m.id !== variables.id),
        );
        return;
      }

      createConversationResponseMutate({
        content: text,
        roomId: variables.roomId,
        isUser: variables.isUser,
      });
    },
  });
};

const useResumeUpload = (roomID?: string) => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => parseAndSaveResume(file),
    onSuccess: (savedData) => {
      console.log("이력서 파싱 및 저장 완료:", savedData);
      alert("이력서가 성공적으로 저장되었습니다.");
      if (roomID) {
        qc.invalidateQueries({ queryKey: ["conversation", roomID] });
      }
    },
    onError: (error) => {
      console.error("이력서 처리 중 오류 발생:", error);
    },
  });
};

const useCandidateList = () => {
  return useQuery({
    queryKey: ["candidates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resumes")
        .select("id, name, total_experience_months, rating, resume_data, created_at")
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);
      return data || [];
    },
  });
};

export {
  useStartConversation,
  useConversationMessage,
  useConversationResponse,
  useResumeUpload,
  useCandidateList,
};
