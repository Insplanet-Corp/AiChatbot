import { supabase } from "../utils/supabase";

type RoomId = string | number;
type UserId = string | number;

const fetchConversations = async (userId?: UserId | null) => {
  if (!userId) return [];

  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("userid", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
};

const startConversation = async ({
  name,
  userId,
}: {
  name: string;
  userId: UserId;
}) => {
  const { data, error } = await supabase
    .from("rooms")
    .insert({ name, userid: userId })
    .select("*")
    .single();

  if (error) throw error;
  return data;
};

const fetchConversation = async (roomId: RoomId) => {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching messages:", error);
    throw error;
  }
  return data;
};

const createConversationMessage = async ({
  content,
  isUser = false,
  roomId,
}: {
  content: string;
  isUser?: boolean;
  roomId: RoomId;
}) => {
  const { data, error } = await supabase
    .from("messages")
    .insert({ content, is_user: isUser, room_id: roomId })
    .select("*")
    .single();

  if (error) {
    console.error("SUPABASE INSERT ERROR:", error);
    throw error;
  }
  return data;
};

const deleteConversation = async (roomId: RoomId) => {
  const { error: msgError } = await supabase
    .from("messages")
    .delete()
    .eq("room_id", roomId);

  if (msgError) throw msgError;

  const { error } = await supabase.from("rooms").delete().eq("id", roomId);
  if (error) throw error;
};

export {
  fetchConversations,
  fetchConversation,
  startConversation,
  createConversationMessage,
  deleteConversation,
};
