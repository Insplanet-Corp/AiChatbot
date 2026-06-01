import styled, { css } from "styled-components";

export const scrollbarStyle = css`
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background-color: var(--color-border-tertiary, #dde0e3);
    border-radius: var(--radius-full, 999px);
  }
  &:hover::-webkit-scrollbar-thumb {
    background-color: var(--color-border-secondary, #cbcfd2);
  }
`;

export const ScrollArea = styled.div`
  width: 100%;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  ${scrollbarStyle}
`;

export const Page = styled.div`
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--color-bg-primary, #ffffff);
`;

export const Sidebar = styled.aside<{ $open?: boolean }>`
  width: var(--sidebar-width, 260px);
  flex-shrink: 0;
  background-color: var(--color-bg-surface-primary, #f9f9fa);
  border-right: 1px solid var(--color-border-muted, #e6e8ea);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: var(--space-12, 12px) var(--space-8, 8px);
  gap: var(--space-4, 4px);
  transition: transform 0.25s ease;
  ${scrollbarStyle}

  @media (max-width: 768px) {
    position: fixed;
    left: 0;
    top: 0;
    height: 100vh;
    z-index: 300;
    box-shadow: var(--shadow-5);
    transform: translateX(${(p) => (p.$open ? "0" : "-100%")});
  }
`;

export const SidebarOverlay = styled.div<{ $visible?: boolean }>`
  display: none;

  @media (max-width: 768px) {
    display: ${(p) => (p.$visible ? "block" : "none")};
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.4);
  }
`;

export const Main = styled.main`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
`;

export const FixedTop = styled.div`
  flex-shrink: 0;
  z-index: 100;
  background: var(--color-bg-primary, #ffffff);
  border-bottom: 1px solid var(--color-border-muted, #e6e8ea);
`;

export const ScrollBody = styled.div`
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  ${scrollbarStyle}
`;

export const FixedBottom = styled.div`
  flex-shrink: 0;
  z-index: 100;
  background: var(--color-bg-primary, #ffffff);
  border-top: 1px solid var(--color-border-muted, #e6e8ea);
  padding: var(--space-16, 16px);

  @media (max-width: 640px) {
    padding: var(--space-12, 12px) var(--space-12, 12px);
  }
`;

export const ContentInner = styled.div<{
  size?: "narrow" | "wide" | "full" | null;
}>`
  width: 100%;
  margin: 0 auto;
  max-width: ${(props) => {
    if (props.size === "narrow") return "800px";
    if (props.size === "wide") return "1200px";
    return "100%";
  }};
  padding: 0 2rem;
  box-sizing: border-box;

  @media (max-width: 640px) {
    padding: 0 1rem;
  }
`;
