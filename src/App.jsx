import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./App.css";
import { Route, Routes } from "react-router-dom";
import ConversationPage from "./pages/ConversationPage.js";
import PasswordPage from "./pages/PasswordPage";
import ChatLayout from "./components/ChatLayout";
import { CandidateDetailPane } from "./components/CandidateDetailPane";
import ProtectedRoute from "./utils/RotectedRoute";
import HomePage from "./pages/HomePage";
import CandidatesPage from "./pages/CandidatesPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/" element={<PasswordPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<ChatLayout />}>
            <Route path="/chat" element={<HomePage />} />
            <Route path="/chat/:id" element={<ConversationPage />}>
              <Route
                path="candidate/:candidateId"
                element={<CandidateDetailPane />}
              />
            </Route>
            <Route path="/candidates" element={<CandidatesPage />}>
              <Route
                path="candidate/:candidateId"
                element={<CandidateDetailPane />}
              />
            </Route>
          </Route>
        </Route>
      </Routes>
    </QueryClientProvider>
  );
}

export default App;
