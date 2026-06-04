import { Suspense, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  QueryErrorResetBoundary,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { SyncLoader } from "react-spinners";
import { getUser } from "../utils/getUser";
import { useNavigate, useParams } from "react-router-dom";
import { fetchConversations } from "../apis/conversation";
import { useDeleteConversation } from "../hooks/queries";
import styled from "styled-components";

const override = {
  display: "block",
  margin: "2",
  borderColor: "white",
};

function RoomsSkeleton() {
  return (
    <div className="conversationList">
      <div className="loader">
        <SyncLoader
          color={"var(--color-text-muted, #9b9fa6)"}
          loading={true}
          cssOverride={override}
          size={8}
          aria-label="Loading Spinner"
          data-testid="loader"
          speedMultiplier={1}
        />
      </div>
    </div>
  );
}

function RoomsErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: unknown;
  resetErrorBoundary: () => void;
}) {
  return (
    <div style={{ padding: 12 }}>
      <div style={{ marginBottom: 8 }}>
        방 목록을 불러오지 못했어요:{" "}
        {error instanceof Error ? error.message : String(error)}
      </div>
      <button type="button" onClick={resetErrorBoundary}>
        다시 시도
      </button>
    </div>
  );
}

function ConversationListInner() {
  const navigate = useNavigate();
  const { id: currentRoomId } = useParams();
  const user = getUser();
  const deleteConversation = useDeleteConversation();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const { data: conversations } = useSuspenseQuery({
    queryKey: ["conversations", user?.id],
    queryFn: () => fetchConversations(user?.id),
  });

  const handleDelete = (e: React.MouseEvent, roomId: string) => {
    e.stopPropagation();
    if (!confirm("이 대화를 삭제할까요?")) return;
    deleteConversation.mutate(roomId, {
      onSuccess: () => {
        if (currentRoomId === roomId) {
          navigate("/");
        }
      },
    });
  };

  return (
    <div className="conversationList">
      {conversations.map((conversation) => (
        <ConversationItem
          key={conversation.id}
          $active={currentRoomId === String(conversation.id)}
          onMouseEnter={() => setHoveredId(String(conversation.id))}
          onMouseLeave={() => setHoveredId(null)}
          onClick={() => navigate(`/chat/${conversation.id}`)}
        >
          <ConversationName>{conversation.name}</ConversationName>
          {hoveredId === String(conversation.id) && (
            <DeleteButton
              onClick={(e) => handleDelete(e, String(conversation.id))}
              title="대화 삭제"
            >
              ✕
            </DeleteButton>
          )}
        </ConversationItem>
      ))}
    </div>
  );
}

function ConversationList() {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary onReset={reset} FallbackComponent={RoomsErrorFallback}>
          <Suspense fallback={<RoomsSkeleton />}>
            <ConversationListInner />
          </Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

const ConversationItem = styled.div<{ $active?: boolean }>`
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-8, 8px);
  padding: var(--space-8, 8px) var(--space-12, 12px);
  border: none;
  border-radius: var(--radius-md, 8px);
  background: ${(p) =>
    p.$active
      ? "var(--color-interaction-hover-strong, rgba(24, 26, 27, 0.16))"
      : "transparent"};
  cursor: pointer;
  transition: background-color 0.15s ease;
  font-size: var(--font-size-label-md, 14px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text-primary, #3c3e44);
  text-align: left;

  &:hover {
    background-color: var(--color-interaction-hover-strong, rgba(24, 26, 27, 0.16));
  }
`;

const ConversationName = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const DeleteButton = styled.button`
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-muted, #9b9fa6);
  font-size: 11px;
  cursor: pointer;
  padding: 0;

  &:hover {
    background-color: rgba(213, 37, 37, 0.12);
    color: var(--color-text-status-negative, #d52525);
  }
`;

export default ConversationList;
