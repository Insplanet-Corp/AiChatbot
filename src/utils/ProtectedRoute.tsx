import React, { useEffect, useState } from "react";
import { Navigate, Outlet, useNavigate } from "react-router-dom";
import { decryptJSON } from "../utils/encrypt";

interface UserSession {
  id: string;
  name: string;
}

const ProtectedRoute = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserSession | null>(null);

  const checkAuth = () => {
    try {
      const encryptedSession = localStorage.getItem("user_session");
      if (!encryptedSession) throw new Error("로그인 정보가 없습니다.");
      const decryptedData = decryptJSON(encryptedSession) as UserSession;

      if (!decryptedData || !decryptedData.name) {
        throw new Error("유효하지 않은 세션입니다.");
      }
      setUser(decryptedData);
    } catch (error) {
      console.error("인증 실패:", error);
      localStorage.removeItem("user_session");
      navigate("/");
    }
  };

  useEffect(() => {
    checkAuth();

    const intervalId = setInterval(
      () => {
        checkAuth();
      },
      1000 * 60 * 60,
    );

    return () => clearInterval(intervalId);
  }, [navigate]);

  if (!user) return <div>인증 확인 중...</div>;

  return <Outlet context={{ user }} />;
};

export default ProtectedRoute;
