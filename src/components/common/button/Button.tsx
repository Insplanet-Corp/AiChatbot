import React from "react";
import styled, { css } from "styled-components";
import tokens from "../../../utils/tokens";

const btnTokens = tokens["3.-component-tokens"]["type-1"].button;
const typoTokens = tokens["2.-semantic-tokens"].light.scale.type.label;
const interactionTokens = tokens["2.-semantic-tokens"].light.interaction;
const colorTokens = tokens["2.-semantic-tokens"].light.color;
const paletteTokens = tokens["1.-primitives"].palettet.static;

export type ButtonSize = Exclude<
  keyof typeof btnTokens.size,
  "segmented" | "xlarge"
>;
type ButtonStyle = "filled" | "outlined" | "subtle" | "ghost";
type ButtonState = "default" | "hover" | "pressed" | "focus" | "disabled";

interface BaseProps {
  style?: ButtonStyle;
  size?: ButtonSize;
  state?: ButtonState;
  leadingIcon?: React.ReactNode;
  children: React.ReactNode;
  trailingIcon?: React.ReactNode;
  onClick?: () => void;
}

const Button = ({
  style = "filled",
  size = "medium",
  state = "default",
  leadingIcon,
  children,
  trailingIcon,
  onClick,
}: BaseProps) => {
  return (
    <StyleButton
      $styled={style}
      size={size}
      data-state={state}
      onClick={onClick}
      disabled={state === "disabled"}
    >
      {leadingIcon && <span>{leadingIcon}</span>}
      {children}
      {trailingIcon && <span>{trailingIcon}</span>}
    </StyleButton>
  );
};

const SIZE_MAP: Record<ButtonSize, any> = {
  tiny: css`
    height: ${btnTokens.size.tiny.value};
    gap: 4px;
    padding: 0 ${btnTokens["spacing-small"].value};
    font-size: ${typoTokens.small.value};
    border-radius: ${btnTokens.radius.xsmall.value};
  `,
  small: css`
    height: ${btnTokens.size.small.value};
    gap: 4px;
    padding: 0 ${btnTokens["spacing-medium"].value};
    font-size: ${typoTokens.medium.value};
    border-radius: ${btnTokens.radius.small.value};
  `,
  medium: css`
    height: ${btnTokens.size.medium.value};
    gap: 6px;
    padding: 0 ${btnTokens["spacing-medium"].value};
    font-size: ${typoTokens.large.value};
    border-radius: ${btnTokens.radius.medium.value};
  `,
  large: css`
    height: ${btnTokens.size.large.value};
    gap: 8px;
    padding: 0 ${btnTokens["spacing-large"].value};
    font-size: ${typoTokens.large.value};
    border-radius: ${btnTokens.radius.large.value};
  `,
};

// css 템플릿 리터럴 블록
// css 코드 통째로 묶어서 반환.
// hover active 등등 가상 클래스 중첩 스타일을 다루기에 좋음.
const STYLED_MAP: Record<ButtonStyle, any> = {
  filled: css`
    background-color: ${btnTokens.container.solid.brand.value};
    color: ${paletteTokens.white.value};
  `,
  outlined: css`
    background-color: transparent;
    border-color: ${tokens["3.-component-tokens"]["type-1"].button.border
      .default.value};
    color: ${colorTokens.text.primary.value};
    &:hover,
    &[data-state="hover"],
    &:active,
    &[data-state="pressed"] {
      border-color: ${tokens["2.-semantic-tokens"].light.interaction.hover
        .value};
    }
  `,
  subtle: css`
    background-color: ${tokens["3.-component-tokens"]["type-1"].button.container
      .subtle.value};
    color: ${colorTokens.text.primary.value};
  `,
  ghost: css`
    background-color: transparent;
    color: ${colorTokens.text.primary.value};
  `,
};

const StyleButton = styled.button<{ $styled: ButtonStyle; size: ButtonSize }>`
  display: inline-flex;
  position: relative;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  font-weight: 600;
  border: 1px solid transparent;

  & > * {
    position: relative;
    z-index: 1;
  }

  &:hover,
  &[data-state="hover"] {
    border-color: transparent;
  }

  ${({ size }) => SIZE_MAP[size]}
  ${({ $styled }) => STYLED_MAP[$styled]}

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background-color: transparent;
    pointer-events: none;
    transition: background-color 0.2s ease-in-out;
    z-index: 0;
  }

  &:hover::after,
  &[data-state="hover"]::after {
    background-color: ${interactionTokens.surface.pressed.value};
  }

  &:active::after,
  &[data-state="pressed"]::after {
    background-color: ${interactionTokens.surface["pressed-strong"].value};
  }

  &:focus,
  &[data-state="focus"] {
    outline: 2px solid ${interactionTokens.focus.outline.value};
  }

  &:disabled,
  &[data-state="disabled"] {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

export default Button;
