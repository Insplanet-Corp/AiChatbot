import { Page, Sidebar } from "./layouts";

import Spacer from "./Spacer";
import Row from "./Row";
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
    <Page hasSidebar>
      <Sidebar>
        <Row justify="space-between" align="center">
          1
        </Row>
        <Spacer size={4} />
        <Spacer size={4} />

        <MenuItem onClick={() => navigate(`/chat`)}>새로운 채팅</MenuItem>

        <ConversationList />

        <Row gap={12} justify="space-between" style={{ marginTop: "auto" }}>
          <Box direction="row" gap={8}>
            <Avatar style="icon" size={25} icon={<Icon name="Profile" />} />
            <Text variant="bodyLg">{user.name}</Text>
          </Box>
          <button
            onClick={() => {
              localStorage.removeItem("user_session");
              navigate("/");
            }}
          >
            <Icon name="Exit" size={20} />
          </button>
        </Row>
      </Sidebar>

      <Outlet />
    </Page>
  );
};

export default ChatLayout;
