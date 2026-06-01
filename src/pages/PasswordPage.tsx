import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { SERVICE_NAME } from "../constants/service";
import { supabase } from "../utils/supabase";
import { decryptJSON, encryptJSON } from "../utils/encrypt";

const PasswordPage = () => {
  const [password, setPassword] = useState("");
  const [isError, setIsError] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const session = localStorage.getItem("user_session");

    if (session) {
      try {
        const decryptedData = decryptJSON(session) as {
          id: string;
          name: string;
        };

        if (decryptedData && decryptedData.id) {
          navigate("/chat", { replace: true });
        }
      } catch (error) {
        localStorage.removeItem("user_session");
      }
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data, error } = await supabase
        .from("user")
        .select("id, name")
        .eq("password", password)
        .maybeSingle();

      if (error) throw new Error(error.message);

      if (data) {
        const sessionData = {
          id: data.id,
          name: data.name,
        };

        const encryptedSession = encryptJSON(sessionData);

        localStorage.setItem("user_session", encryptedSession);

        navigate("/chat");
      } else {
        setIsError(true);
        setPassword("");
      }
    } catch (err) {
      console.error("인증 실패:", err);
      setIsError(true);
      setPassword("");
    }
  };

  return (
    <Container>
      <Card>
        <Title>{SERVICE_NAME}</Title>
        <Subtitle>서비스에 접근하려면 비밀번호를 입력해주세요.</Subtitle>

        <Form onSubmit={handleSubmit}>
          <Input
            type="password"
            placeholder="비밀번호 입력"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            $isError={isError}
            autoFocus
          />
          {isError && (
            <ErrorMessage>비밀번호가 일치하지 않습니다.</ErrorMessage>
          )}
          <SubmitButton type="submit">입장하기</SubmitButton>
        </Form>
      </Card>
    </Container>
  );
};

const Container = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background-color: #f3f4f6;
`;

const Card = styled.div`
  background-color: #ffffff;
  padding: 40px;
  border-radius: 16px;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06);
  width: 100%;
  max-width: 400px;
  text-align: center;
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: bold;
  color: #111827;
  margin-bottom: 8px;
`;

const Subtitle = styled.p`
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 32px;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Input = styled.input<{ $isError: boolean }>`
  padding: 12px 16px;
  font-size: 16px;
  border-radius: 8px;
  border: 1px solid ${(props) => (props.$isError ? "#ef4444" : "#d1d5db")};
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: ${(props) => (props.$isError ? "#ef4444" : "#3b82f6")};
    box-shadow: 0 0 0 1px ${(props) => (props.$isError ? "#ef4444" : "#3b82f6")};
  }
`;

const ErrorMessage = styled.span`
  color: #ef4444;
  font-size: 12px;
  text-align: left;
  margin-top: -8px;
`;

const SubmitButton = styled.button`
  background-color: #111827;
  color: #ffffff;
  padding: 12px;
  font-size: 16px;
  font-weight: bold;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #374151;
  }
`;

export default PasswordPage;
