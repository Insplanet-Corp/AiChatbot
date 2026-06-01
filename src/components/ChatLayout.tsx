import { useState } from "react";
import { Page, Sidebar, SidebarOverlay } from "./layouts";
import ConversationList from "./ConversationList";
import MenuItem from "./menu-item";
import { useNavigate, Outlet, useOutletContext, useLocation } from "react-router-dom";
import Text from "./common/text/Text";
import Icon from "./common/Icon/Icon";
import { Avatar } from "./common/avatar";
import Box from "./common/flex/box";
import styled from "styled-components";
import { Menu, X, Plus } from "lucide-react";

type AuthContextType = {
  user: { id: string; name: string };
};

const ChatLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useOutletContext<AuthContextType>();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <Page>
      <SidebarOverlay $visible={sidebarOpen} onClick={closeSidebar} />

      <Sidebar $open={sidebarOpen}>
        <SidebarHeader>
          <Text variant="labelSm" weight="semibold" color="var(--color-text-tertiary)">
            대화 목록
          </Text>
          <CloseSidebarBtn onClick={closeSidebar}>
            <X size={16} />
          </CloseSidebarBtn>
        </SidebarHeader>

        <MenuItem
          icon={<Plus size={15} />}
          onClick={() => {
            navigate("/chat");
            closeSidebar();
          }}
        >
          새로운 채팅
        </MenuItem>

        <div
          onClick={closeSidebar}
          style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
        >
          <ConversationList />
        </div>

        <UserRow>
          <Box direction="row" gap={8} style={{ alignItems: "center", minWidth: 0 }}>
            <Avatar style="icon" size={28} seed={user.name} />
            <Text variant="labelMd" weight="medium" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user.name}
            </Text>
          </Box>
          <button
            onClick={() => {
              localStorage.removeItem("user_session");
              navigate("/");
            }}
          >
            <Icon name="Exit" size={20} />
          </button>
        </UserRow>
      </Sidebar>

      <ContentColumn>
        <GlobalTopNav>
          <HamburgerBtn onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </HamburgerBtn>
          <NavTabs>
            <NavTab
              $active={location.pathname.startsWith("/chat")}
              onClick={() => navigate("/chat")}
            >
              인력 찾기
            </NavTab>
            <NavTab
              $active={location.pathname.startsWith("/candidates")}
              onClick={() => navigate("/candidates")}
            >
              인력 프로필
            </NavTab>
          </NavTabs>
        </GlobalTopNav>

        <Outlet />
      </ContentColumn>
    </Page>
  );
};

const ContentColumn = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
`;

const GlobalTopNav = styled.nav`
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  height: 50px;
  border-bottom: 1px solid var(--color-border-muted, #e6e8ea);
  background: var(--color-bg-primary, #ffffff);
`;

const HamburgerBtn = styled.button`
  display: none;
  align-items: center;
  justify-content: center;
  width: 50px;
  flex-shrink: 0;
  color: var(--color-icon-secondary, #6d7178);
  transition: background 0.15s;

  &:hover {
    background: var(--color-interaction-hover-strong, rgba(24, 26, 27, 0.16));
    color: var(--color-icon-primary, #3c3e44);
  }

  @media (max-width: 768px) {
    display: flex;
  }
`;

const NavTabs = styled.div`
  display: flex;
  align-items: stretch;
  gap: 0;
  padding: 0 var(--space-8, 8px);
`;

const NavTab = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  padding: 0 var(--space-16, 16px);
  font-size: var(--font-size-label-md, 14px);
  font-weight: ${({ $active }) => ($active ? "var(--font-weight-semibold, 600)" : "var(--font-weight-regular, 400)")};
  color: ${({ $active }) => ($active ? "var(--color-text-emphasis, #181a1b)" : "var(--color-text-tertiary, #878a92)")};
  background: none;
  border: none;
  border-bottom: 2px solid ${({ $active }) => ($active ? "var(--color-text-emphasis, #181a1b)" : "transparent")};
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  white-space: nowrap;

  &:hover {
    color: var(--color-text-emphasis, #181a1b);
  }
`;

const SidebarHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4, 4px) var(--space-4, 4px) var(--space-8, 8px);
`;

const CloseSidebarBtn = styled.button`
  display: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md, 8px);
  color: var(--color-icon-secondary, #6d7178);

  &:hover {
    background: var(--color-interaction-hover-strong, rgba(24, 26, 27, 0.16));
  }

  @media (max-width: 768px) {
    display: flex;
  }
`;

const UserRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-8, 8px);
  padding: var(--space-8, 8px) var(--space-4, 4px) 0;
  border-top: 1px solid var(--color-border-muted, #e6e8ea);
  margin-top: auto;
  min-width: 0;
`;

export default ChatLayout;
