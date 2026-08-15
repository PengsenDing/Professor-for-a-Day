import React from "react";
import { AbsoluteFill } from "remotion";
import { BOARD, COLORS, COMPOSITION } from "../introConfig";

type WhiteboardBackgroundProps = {
  /** 0 → bare color only, 1 → texture and shading fully revealed. */
  reveal: number;
};

/**
 * The whiteboard surface: a warm off-white base that is always present
 * (no flash on frame 0), over which a paper-grain noise texture, two faint
 * eraser smudges, and a soft edge shade fade in during Phase 1.
 * The noise uses feTurbulence with a fixed seed, so it is deterministic.
 */
export const WhiteboardBackground: React.FC<WhiteboardBackgroundProps> = ({
  reveal,
}) => {
  const { width, height } = COMPOSITION;
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.board }}>
      <svg width={width} height={height} style={{ position: "absolute" }}>
        <defs>
          <filter id="board-grain">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves={2}
              seed={7}
              stitchTiles="stitch"
            />
            {/* Map the noise to pure black with a very low alpha. */}
            <feColorMatrix
              type="matrix"
              values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${BOARD.textureOpacity} 0`}
            />
          </filter>
          <radialGradient id="board-edge-shade" cx="50%" cy="48%" r="75%">
            <stop offset="60%" stopColor={COLORS.shadow} stopOpacity={0} />
            <stop
              offset="100%"
              stopColor={COLORS.shadow}
              stopOpacity={BOARD.edgeShadeOpacity}
            />
          </radialGradient>
        </defs>

        <rect
          width={width}
          height={height}
          filter="url(#board-grain)"
          opacity={reveal}
        />

        {/* Faint old-eraser smudges — barely visible, just enough life. */}
        <g opacity={reveal * BOARD.smudgeOpacity} fill={COLORS.shadow}>
          <ellipse
            cx={width * 0.3}
            cy={height * 0.72}
            rx={260}
            ry={70}
            style={{ filter: "blur(40px)" }}
          />
          <ellipse
            cx={width * 0.74}
            cy={height * 0.26}
            rx={220}
            ry={60}
            style={{ filter: "blur(40px)" }}
          />
        </g>

        <rect
          width={width}
          height={height}
          fill="url(#board-edge-shade)"
          opacity={reveal}
        />
      </svg>
    </AbsoluteFill>
  );
};
