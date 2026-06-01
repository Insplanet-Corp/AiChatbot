import styled, { css } from "styled-components";
import {
  FontWeight,
  TextElementType,
  textVariants,
  TextVariants,
} from "./TextTypes";
import tokens from "../../../utils/tokens";

interface BaseProps {
  children: React.ReactNode;
  variant?: TextVariants;
  weight?: FontWeight;
  color?: React.CSSProperties["color"];
}

interface TextProps<T> extends BaseProps {
  as?: T;
  trim?: boolean;
  ellipsis?: boolean;
  lines?: number;
}

const Text = <T extends TextElementType = "span">({
  as,
  children,
  variant,
  weight,
  trim,
  ellipsis,
  lines,
  color,
}: TextProps<T>) => {
  return (
    <StyledText
      as={as}
      $variant={variant}
      $weight={weight}
      $trim={trim}
      $ellipsis={ellipsis}
      $lines={lines}
      color={color}
    >
      {children}
    </StyledText>
  );
};

const StyledText = styled.span<{
  as?: React.ElementType;
  $variant?: TextVariants;
  $weight?: FontWeight;
  $trim?: boolean;
  $ellipsis?: boolean;
  $lines?: number;
  color?: string;
}>`
  color: ${({ color }) => color};
  font-size: ${({ $variant }) => $variant && textVariants[$variant].fontSize};
  letter-spacing: ${({ $variant }) =>
    $variant && textVariants[$variant].letterSpacing};
  line-height: ${({ $variant }) => $variant && textVariants[$variant].lineHeight};

  // fontWeight도 따로 정의해서 한번에 쓰는게 좋을 듯.
  font-weight: ${({ $weight }) =>
    $weight && tokens["1.-primitives"].typography["font-weight"][$weight].value};

  ${({ $trim }) =>
    $trim &&
    css`
      line-height: 1;
    `}

  ${({ $ellipsis }) =>
    $ellipsis &&
    css`
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    `}

      ${({ $lines }) =>
    $lines &&
    css`
      display: webkit-box;
      -webkit-line-clamp: ${$lines};
      -webkit-box-orient: vertical;
      overflow: hidden;
    `}
`;

export default Text;
