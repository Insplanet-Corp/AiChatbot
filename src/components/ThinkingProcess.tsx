import { useEffect, useState } from "react";
import styled, { keyframes } from "styled-components";

const STEPS = [
  "요청 내용 파악 중",
  "인력 데이터베이스 검색 중",
  "조건에 맞는 후보 분석 중",
  "결과 정리 중",
];

const STEP_DELAY_MS = 900;

const ThinkingProcess = () => {
  const [visibleCount, setVisibleCount] = useState(1);

  useEffect(() => {
    setVisibleCount(1);
    const timers: ReturnType<typeof setTimeout>[] = [];
    STEPS.forEach((_, i) => {
      if (i === 0) return;
      timers.push(
        setTimeout(() => setVisibleCount(i + 1), i * STEP_DELAY_MS),
      );
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <Wrapper>
      <Header>
        <ThinkIcon>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </ThinkIcon>
        <HeaderText>생각 중...</HeaderText>
      </Header>
      <StepList>
        {STEPS.slice(0, visibleCount).map((step, i) => {
          const isLast = i === visibleCount - 1;
          return (
            <StepItem key={step} $active={isLast}>
              <StepDot $active={isLast}>
                {isLast ? <PulsingDot /> : <DoneMark>✓</DoneMark>}
              </StepDot>
              <StepText $active={isLast}>{step}</StepText>
            </StepItem>
          );
        })}
      </StepList>
    </Wrapper>
  );
};

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.7); }
`;

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  background: var(--color-surface-subtle, #f8f9fa);
  border: 1px solid var(--color-border, #e8eaed);
  border-radius: 12px;
  max-width: 320px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const ThinkIcon = styled.span`
  color: var(--color-primary, #4f8ef7);
  display: flex;
  align-items: center;
`;

const HeaderText = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary, #6d7178);
  letter-spacing: 0.2px;
`;

const StepList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-left: 2px;
`;

const StepItem = styled.div<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  animation: ${fadeIn} 0.3s ease;
`;

const StepDot = styled.div<{ $active: boolean }>`
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: ${({ $active }) =>
    $active ? "var(--color-primary, #4f8ef7)" : "var(--color-success, #34a853)"};
  color: #fff;
  font-size: 9px;
  transition: background 0.2s;
`;

const PulsingDot = styled.div`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fff;
  animation: ${pulse} 1s ease-in-out infinite;
`;

const DoneMark = styled.span`
  font-size: 9px;
  line-height: 1;
`;

const StepText = styled.span<{ $active: boolean }>`
  font-size: 13px;
  color: ${({ $active }) =>
    $active ? "var(--color-text-primary, #1a1d23)" : "var(--color-text-muted, #9b9fa6)"};
  font-weight: ${({ $active }) => ($active ? 500 : 400)};
  transition: color 0.2s;
`;

export default ThinkingProcess;
