import { Page, Sidebar } from "./layouts";
import ConversationList from "./ConversationList";
import MenuItem from "./menu-item";
import { useNavigate, Outlet, useOutletContext } from "react-router-dom";
import Text from "./common/text/Text";
import Icon from "./common/Icon/Icon";
import { Avatar } from "./common/avatar";
import Box from "./common/flex/box";

type AuthContextType = {
  user: { id: string; name: string };
};

const ChatLayout = () => {
  const navigate = useNavigate();
  const { user } = useOutletContext<AuthContextType>();

  return (
    <Page $hasSidebar>
      <Sidebar>
        <MenuItem onClick={() => navigate(`/chat`)}>새로운 채팅</MenuItem>

        <ConversationList />

        <Box direction="row" gap={8} style={{ marginTop: "auto", justifyContent: "space-between", alignItems: "center" }}>
          <Box direction="row" gap={8} style={{ alignItems: "center" }}>
            <Avatar style="icon" size={28} seed={user.name} />
            <Text variant="labelMd" weight="medium">{user.name}</Text>
          </Box>
          <button
            onClick={() => {
              localStorage.removeItem("user_session");
              navigate("/");
            }}
          >
            <Icon name="Exit" size={20} />
          </button>
        </Box>
      </Sidebar>

      <Outlet />
    </Page>
  );
};

export default ChatLayout;
