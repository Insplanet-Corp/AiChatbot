import React from "react";
import styled, { css } from "styled-components";

interface MenuItemProps {
  children?: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}

const MenuItem = ({
  children,
  icon,
  onClick,
  disabled,
  danger,
}: MenuItemProps) => {
  return (
    <StyledMenuItem onClick={onClick} $disabled={disabled} $danger={danger}>
      {icon && <IconWrapper>{icon}</IconWrapper>}
      {children}
    </StyledMenuItem>
  );
};

const StyledMenuItem = styled.button<{
  $danger?: boolean;
  $disabled?: boolean;
}>`
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-8, 8px);
  padding: var(--space-8, 8px) var(--space-12, 12px);
  border: none;
  border-radius: var(--radius-md, 8px);
  background: transparent;
  cursor: pointer;
  transition: background-color 0.15s ease;
  font-size: var(--font-size-label-md, 14px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text-primary, #3c3e44);
  text-align: left;

  &:hover {
    background-color: var(--color-interaction-hover-strong, rgba(24, 26, 27, 0.16));
  }

  &:active {
    background-color: var(--color-interaction-pressed, rgba(24, 26, 27, 0.08));
  }

  ${(props) =>
    props.$disabled &&
    css`
      opacity: 0.4;
      cursor: not-allowed;
      pointer-events: none;
    `}

  ${(props) =>
    props.$danger &&
    css`
      color: var(--color-text-status-negative, #d52525);
      &:hover {
        background-color: #fff0f0;
      }
    `}
`;

const IconWrapper = styled.span`
  display: flex;
  align-items: center;
  font-size: 18px;
`;

export default MenuItem;
