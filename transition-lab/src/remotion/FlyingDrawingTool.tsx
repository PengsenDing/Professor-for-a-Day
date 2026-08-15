import React from "react";
import { COLORS, COMPOSITION, TOOL } from "../introConfig";

export type ToolState = {
  /** Pen tip position in board coordinates. */
  x: number;
  y: number;
  /** Rotation in degrees; 0 = body pointing right, negative = up-right. */
  rotationDeg: number;
  opacity: number;
  /** 0 = pen lifted off the board, 1 = pressed down (drives the shadow). */
  contact: number;
};

/**
 * A minimal line-art chalk marker. Drawn in local coordinates with the tip
 * at the origin and the body extending along +x, then rotated — so placing
 * the tip exactly on the writing path is a single translate.
 */
export const FlyingDrawingTool: React.FC<ToolState> = ({
  x,
  y,
  rotationDeg,
  opacity,
  contact,
}) => {
  const { bodyLength, bodyWidth, strokeWidth } = TOOL;
  const half = bodyWidth / 2;
  const tipLength = 18;

  return (
    <svg
      width={COMPOSITION.width}
      height={COMPOSITION.height}
      style={{ position: "absolute", inset: 0, opacity }}
    >
      {/* Contact shadow, unrotated, hugging the board under the tip. */}
      <ellipse
        cx={x + 8}
        cy={y + 14}
        rx={30}
        ry={7}
        fill={COLORS.shadow}
        opacity={0.07 * contact}
        style={{ filter: "blur(3px)" }}
      />

      <g transform={`translate(${x}, ${y}) rotate(${rotationDeg})`}>
        {/* Chalk tip (the only filled-black shape). */}
        <path
          d={`M 0 0 L ${tipLength} ${-half + 3} L ${tipLength} ${half - 3} Z`}
          fill={COLORS.ink}
        />
        {/* Body: white with a thin ink outline — pure line-art. */}
        <rect
          x={tipLength}
          y={-half}
          width={bodyLength - tipLength}
          height={bodyWidth}
          rx={half}
          fill="#FFFFFF"
          stroke={COLORS.ink}
          strokeWidth={strokeWidth}
        />
        {/* Ferrule line where the tip meets the body. */}
        <line
          x1={tipLength + 16}
          y1={-half}
          x2={tipLength + 16}
          y2={half}
          stroke={COLORS.inkSoft}
          strokeWidth={strokeWidth * 0.8}
        />
      </g>
    </svg>
  );
};
