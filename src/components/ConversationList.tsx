import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  QueryErrorResetBoundary,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { SyncLoader } from "react-spinners";
import MenuItem from "./menu-item";
import { getUser } from "../utils/getUser";
import { useNavigate } from "react-router-dom";
import { fetchConversations } from "../apis/conversation";

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

function ConversationList() {
  const navigate = useNavigate();

  const user = getUser();

  const { data: conversations } = useSuspenseQuery({
    queryKey: ["conversations", user?.id],
    queryFn: () => fetchConversations(user?.id),
  });

  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary onReset={reset} FallbackComponent={RoomsErrorFallback}>
          <Suspense fallback={<RoomsSkeleton />}>
            <div className="conversationList">
              {conversations.map((conversation) => (
                <MenuItem
                  key={conversation.id}
                  onClick={() => navigate(`/chat/${conversation.id}`)}
                >
                  {conversation.name}
                </MenuItem>
              ))}
            </div>
          </Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

export default ConversationList;
