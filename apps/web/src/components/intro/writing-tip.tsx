import React from "react";
import { STROKE } from "./intro-config";
import type { Point } from "./handwriting-path";

type WritingTipProps = {
  /** Tip position in laid-out font units (Y-up), or null when finished. */
  tip: Point | null;
  /** True while the pen travels between strokes without inking. */
  lifted: boolean;
  /** Fades the tip in/out at the entry and after the flourish. */
  opacity: number;
};

/**
 * The visible writing tool: a soft rounded white ball with its own small
 * gray shadow (so it reads against the white background). It is rendered
 * inside the same Y-flipped group as the strokes and placed at the exact
 * path point the reveal edge has reached, so it can never drift from the
 * ink. While lifted (pen-up hops between strokes) it shrinks slightly.
 */
export const WritingTip: React.FC<WritingTipProps> = ({
  tip,
  lifted,
  opacity,
}) => {
  if (!tip || opacity <= 0) {
    return null;
  }
  const r = (STROKE.tipSizeUnits / 2) * (lifted ? 0.8 : 1);
  return (
    <g opacity={opacity}>
      {/* Ball shadow (offsets are Y-up: negative y = down on screen). */}
      <circle
        cx={tip.x + 4}
        cy={tip.y - 26}
        r={r * 1.02}
        fill="#3A3F4A"
        opacity={0.22}
        style={{ filter: "blur(10px)" }}
      />
      <circle cx={tip.x} cy={tip.y} r={r} fill="url(#writing-tip-ball)" />
    </g>
  );
};
