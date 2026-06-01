import { supabase } from "../utils/supabase";

const fetchConversations = async (userId: any) => {
  if (!userId) return [];

  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("userid", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
};

const startConversation = async ({ name, userId }: any) => {
  const { data, error } = await supabase
    .from("rooms")
    .insert({ name: name, userid: userId })
    .select("*")
    .single();

  if (error) throw error;
  return data; // 새로 만들어진 room row
};

// conversations 모두를 get 해오는 관점에서
// fetchConversations 가 더 어울리지 않나 싶습니다.
async function fetchConversation(roomId: any) {
  const { data, error } = await supabase
    .from("messages") // supabase 테이블 명도 변경 고민. conversation
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching messages:", error);
    throw error;
  }
  return data;
}

// insert conversation / 추가 후 데이터 가져오기.
async function createConversationMessage({
  content,
  isUser = false,
  roomId,
}: any) {
  const { data, error } = await supabase
    .from("messages")
    .insert({ content: content, is_user: isUser, room_id: roomId })
    .select("*")
    .single();

  if (error) {
    console.error("SUPABASE INSERT ERROR:", error);
    throw error;
  }
  return data; // 새로 만들어진 room row
}

async function deleteConversation(roomId: string) {
  const { error: msgError } = await supabase
    .from("messages")
    .delete()
    .eq("room_id", roomId);

  if (msgError) throw msgError;

  const { error } = await supabase.from("rooms").delete().eq("id", roomId);
  if (error) throw error;
}

export {
  fetchConversations,
  fetchConversation,
  startConversation,
  createConversationMessage,
  deleteConversation,
};
