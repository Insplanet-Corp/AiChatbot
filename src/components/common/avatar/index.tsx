import React, { useMemo, useState } from "react";
import styled, { css } from "styled-components";

type AvatarStyle = "icon" | "text" | "emoji" | "photo";
type AvatarState = "default" | "hover" | "pressed" | "focus" | "disabled";

const FALLBACK_EMOJIS = [
  "🐶", "🐱", "🐭", "🐹", "🐰",
  "🦊", "🐻", "🐼", "🐨", "🐯",
  "🦁", "🐸", "🐧", "🐦", "🦆",
  "🦋", "🐙", "🦀", "🐬", "🦄",
];

type Common = {
  size: number;
  state?: AvatarState;
  seed?: string | number;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
};

type AvatarProps =
  | (Common & { style: "photo"; src?: string | null; alt?: string })
  | (Common & { style: "text"; text: string })
  | (Common & { style: "emoji"; emoji: string })
  | (Common & { style: "icon"; icon?: React.ReactNode });

const Avatar = (props: AvatarProps) => {
  const size = props.size;
  const state = props.state ?? "default";
  const [imgError, setImgError] = useState(false);

  const isInteractive = !!props.onClick;
  const disabled = props.disabled ?? state === "disabled";
  const Wrapper = isInteractive ? Clickable : NonClickable;

  const fallbackEmoji = useMemo(() => {
    const seed = props.seed ?? (props.style === "photo" ? props.alt : undefined);
    if (seed !== undefined) {
      const hash =
        typeof seed === "number"
          ? seed
          : seed.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
      return FALLBACK_EMOJIS[Math.abs(hash) % FALLBACK_EMOJIS.length];
    }
    return FALLBACK_EMOJIS[0];
  }, [props.seed, props.style === "photo" ? props.alt : undefined]);

  const content = (() => {
    if (props.style === "photo" && props.src && !imgError) {
      return (
        <img
          src={props.src}
          alt={props.alt ?? "avatar"}
          onError={() => setImgError(true)}
        />
      );
    }
    if (props.style === "text") return <span>{props.text}</span>;
    if (props.style === "emoji") return <span>{props.emoji}</span>;
    if (props.style === "icon" && props.icon) return <IconWrap>{props.icon}</IconWrap>;
    return <EmojiWrap>{fallbackEmoji}</EmojiWrap>;
  })();

  return (
    <Wrapper
      $size={size}
      $state={state}
      {...(isInteractive
        ? { onClick: props.onClick, disabled, type: "button" as const }
        : {})}
    >
      {content}
    </Wrapper>
  );
};

const avatarBase = css<{ $size: number; $state: AvatarState }>`
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid #ddd;
  border-radius: 50%;
  background-color: #fff;
  transition: all 0.15s ease;
  flex-shrink: 0;

  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  font-size: ${({ $size }) => Math.round($size * 0.5)}px;

  ${({ $state }) => stateStyles[$state]}

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  color: var(--color-icon-inverse, #fff);

  &:hover {
    background-color: var(--color-border-primary, #55585e);
  }
  &:active {
    background-color: var(--color-border-primary, #55585e);
  }
  &:focus-visible {
    outline: 2px solid var(--color-interaction-focus-outline, #23c7cd);
  }
`;

const stateStyles: Record<AvatarState, ReturnType<typeof css>> = {
  default: css`
    background-color: #fff;
  `,
  hover: css`
    background-color: var(--color-border-primary, #55585e);
    cursor: pointer;
  `,
  pressed: css`
    background-color: var(--color-border-primary, #55585e);
    transform: scale(0.95);
  `,
  focus: css`
    background-color: var(--color-interaction-disabled, #b3b7bd);
    outline: 2px solid var(--color-interaction-focus-outline, #23c7cd);
  `,
  disabled: css`
    opacity: 0.4;
    background-color: var(--color-interaction-disabled, #b3b7bd);
    cursor: not-allowed;
  `,
};

const Clickable = styled.button<{ $size: number; $state: AvatarState }>`
  ${avatarBase}
  padding: 0;
  appearance: none;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    pointer-events: none;
    opacity: 0.4;
    transform: none;
  }
`;

const NonClickable = styled.span<{ $size: number; $state: AvatarState }>`
  ${avatarBase}
  cursor: default;
  &:hover,
  &:active {
    background-color: var(--color-interaction-disabled, #b3b7bd);
    transform: none;
  }
`;

const IconWrap = styled.span`
  width: 80%;
  height: 80%;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  & > svg,
  & > img {
    width: 100%;
    height: 100%;
    display: block;
  }
`;

const EmojiWrap = styled.span`
  line-height: 1;
  user-select: none;
`;

export { Avatar };
export { FALLBACK_EMOJIS };
