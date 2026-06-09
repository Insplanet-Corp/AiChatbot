import React, { forwardRef, useLayoutEffect, useRef } from "react";
import styled, { css, RuleSet } from "styled-components";
import tokens from "../../../utils/tokens";
import { useAutoResize } from "./hooks";

export type TextAreaVariant = "outline" | "subtle";
export type TextAreaState =
  | "default"
  | "error"
  | "focus"
  | "focusVisible"
  | "readOnly"
  | "disabled";
export type TextAreaSize = "medium" | "large";

export interface AreaInputBaseProps {
  variant: TextAreaVariant;
  size?: TextAreaSize;
  state?: TextAreaState;
  width?: number | string;
  height?: number;
  minHeight?: number;

  value?: string | number | readonly string[];
  defaultValue?: string | number | readonly string[];
  placeholder?: string;
  name?: string;
  id?: string;
  disabled?: boolean;
  readOnly?: boolean;

  onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
  onFocus?: React.FocusEventHandler<HTMLTextAreaElement>;
  onBlur?: React.FocusEventHandler<HTMLTextAreaElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>;
}

const inputTokens = tokens["3.-component-tokens"]["type-1"].input;
const semanticLight = tokens["2.-semantic-tokens"].light;

const SIZE_MAP: Record<TextAreaSize, RuleSet<object>> = {
  medium: css`
    min-height: ${inputTokens.size.medium.value};
    border-radius: ${inputTokens.radius.large.value};
    padding-block: ${semanticLight.scale.space.xsmall.value};
    padding-inline: ${semanticLight.scale.space.small.value};
  `,
  large: css`
    min-height: ${inputTokens.size.large.value};
    border-radius: ${inputTokens.radius.large.value};
    padding-block: ${semanticLight.scale.space.small.value};
    padding-inline: ${semanticLight.scale.space.medium.value};
  `,
};

const VARIANT_MAP: Record<TextAreaVariant, RuleSet<object>> = {
  outline: css`
    background-color: ${inputTokens.container.surface.value};
    border: 1px solid ${inputTokens.border.default.value};

    &[data-state="error"] {
      border-color: ${semanticLight.color.border.status.negative.value};
    }
    &[data-state="focusVisible"] {
      border-color: ${semanticLight.interaction.pressed.value};
    }
    &[data-state="readOnly"],
    &[data-state="disabled"] {
      background-color: ${semanticLight.interaction.surface.disabled.value};
      border-color: ${semanticLight.interaction["disabled-border"].value};
    }
  `,

  subtle: css`
    border: 1px solid transparent;
    background-color: ${inputTokens.container.subtle.value};

    &[data-state="error"] {
      background-color: ${semanticLight.color.background.surface.status.negative
        .value};
    }
    &[data-state="focusVisible"] {
      border-color: ${semanticLight.interaction.pressed.value};
    }
    &[data-state="readOnly"],
    &[data-state="disabled"] {
      background-color: ${semanticLight.interaction.surface.disabled.value};
    }
  `,
};

const AreaInput = forwardRef<HTMLTextAreaElement, AreaInputBaseProps>(
  (
    {
      variant,
      size = "medium",
      state = "default",
      width,
      height,
      minHeight,
      onChange,
      ...rest
    },
    ref,
  ) => {
    const { setRefs, adjustHeight } = useAutoResize(ref, height, rest.value);

    const onChangeHandler = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      adjustHeight();
      if (onChange) onChange(e);
    };

    return (
      <TextAreaContainer
        width={width}
        $variant={variant}
        size={size}
        data-state={state}
      >
        <StyledTextArea
          ref={setRefs}
          {...rest}
          height={height}
          minHeight={minHeight}
          disabled={state === "disabled" || rest.disabled}
          readOnly={state === "readOnly" || rest.readOnly}
          onChange={onChangeHandler}
        />
      </TextAreaContainer>
    );
  },
);

const TextAreaContainer = styled.div<{
  width: number | string;
  $variant: TextAreaVariant;
  size: TextAreaSize;
}>`
  display: flex;
  gap: 8px;
  transition: all 0.2s ease-in-out;
  color: #111;

  ${({ size }) => SIZE_MAP[size]}
  ${({ $variant }) => VARIANT_MAP[$variant]}

  width: ${({ width }) => (typeof width === "number" ? `${width}px` : width)};

  &:focus-within,
  &[data-state="focus"] {
    outline: 2px solid ${semanticLight.interaction.focus.outline.value};
  }
`;

const StyledTextArea = styled.textarea<{
  height?: number;
  minHeight?: number;
}>`
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 16px;
  color: inherit;
  font-family: inherit;
  resize: vertical;
  line-height: 1.5;
  resize: none;
  font-size: ${semanticLight.scale.type.body.medium.value};
  font-weight: 500;

  overflow-y: ${({ height }) => (height ? "auto" : "hidden")};

  ${({ height }) =>
    height &&
    css`
      height: ${height}px;
    `}
  ${({ minHeight }) =>
    minHeight &&
    css`
      min-height: ${minHeight}px;
    `}

  &::placeholder {
    color: #bfbfbf;
  }

  &:disabled {
    cursor: not-allowed;
    color: ${semanticLight.interaction.disabled.value};
  }
`;

export default AreaInput;
