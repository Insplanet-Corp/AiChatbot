import styled, { css } from "styled-components";
import tokens from "../../../utils/tokens";

const btnTokens = tokens["3.-component-tokens"]["type-1"].button;
const semanticLight = tokens["2.-semantic-tokens"].light;
const interactionTokens = semanticLight.interaction;
const colorTokens = semanticLight.color;
const paletteTokens = tokens["1.-primitives"].palettet.static;

type ButtonSize = Exclude<keyof typeof btnTokens.size, "segmented">;
type ButtonStyle = "filled" | "outlined" | "subtle" | "ghost";
type ButtonState = "default" | "hover" | "pressed" | "focus" | "disabled";

interface BaseProps {
  style?: ButtonStyle;
  size?: ButtonSize;
  state?: ButtonState;
  children: React.ReactNode;
  onClick?: () => void;
}

const IconButton = ({
  style = "filled",
  size = "medium",
  state = "default",
  children,
  onClick,
}: BaseProps) => {
  return (
    <StyledIconButton
      $styled={style}
      size={size}
      data-state={state}
      onClick={onClick}
      disabled={state === "disabled"}
    >
      {children}
    </StyledIconButton>
  );
};

const SIZE_MAP: Record<ButtonSize, any> = {
  tiny: css`
    width: ${btnTokens.size.tiny.value};
    height: ${btnTokens.size.tiny.value};
    border-radius: ${btnTokens.radius.xsmall.value};
  `,
  small: css`
    width: ${btnTokens.size.small.value};
    height: ${btnTokens.size.small.value};
    border-radius: ${btnTokens.radius.small.value};
  `,
  medium: css`
    width: ${btnTokens.size.medium.value};
    height: ${btnTokens.size.medium.value};
    border-radius: ${btnTokens.radius.medium.value};
  `,
  large: css`
    width: ${btnTokens.size.large.value};
    height: ${btnTokens.size.large.value};
    border-radius: ${btnTokens.radius.large.value};
  `,
  xlarge: css`
    width: ${btnTokens.size.xlarge.value};
    height: ${btnTokens.size.xlarge.value};
    border-radius: ${btnTokens.radius.large.value};
  `,
};

const STYLED_MAP: Record<ButtonStyle, any> = {
  filled: css`
    background-color: ${btnTokens.container.solid.brand.value};
    color: ${paletteTokens.white.value};
  `,
  outlined: css`
    background-color: transparent;
    border-color: ${btnTokens.border.default.value};
    color: ${colorTokens.icon.primary.value};

    &:hover,
    &[data-state="hover"],
    &:active,
    &[data-state="pressed"] {
      border-color: ${interactionTokens.hover.value};
    }
  `,
  subtle: css`
    background-color: ${btnTokens.container.subtle.value};
    color: ${colorTokens.text.primary.value};
  `,
  ghost: css`
    background-color: transparent;
    color: ${colorTokens.text.primary.value};
  `,
};

const StyledIconButton = styled.button<{
  $styled: ButtonStyle;
  size: ButtonSize;
}>`
  display: inline-flex;
  position: relative;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  border: 1px solid transparent;
  padding: 0;

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

  &:focus-visible,
  &[data-state="focus"] {
    outline: 2px solid ${interactionTokens.focus.outline.value};
  }

  &:disabled,
  &[data-state="disabled"] {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

export default IconButton;
