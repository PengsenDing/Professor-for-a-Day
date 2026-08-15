import React from "react";
import { DRAW_SEGMENTS } from "./handwriting-path";

type StrokePathsProps = {
  /** Revealed length per stroke, aligned with DRAW_SEGMENTS. */
  visible: number[];
  strokeWidth: number;
  /** Paint of the stroke — usually the neon gradient url. */
  stroke: string;
};

/**
 * The raw pen strokes. Each stroke is dash-revealed to its `visible`
 * length: dasharray = full length, dashoffset = the hidden remainder —
 * the reveal edge is therefore exactly the point the writing tip occupies.
 * (Strokes with nothing visible are skipped entirely: a zero-length dash
 * with round caps would otherwise paint a stray dot at the stroke start.)
 */
export const StrokePaths: React.FC<StrokePathsProps> = ({
  visible,
  strokeWidth,
  stroke,
}) => {
  return (
    <>
      {DRAW_SEGMENTS.map((seg, i) =>
        visible[i] > 0.5 ? (
          <path
            key={i}
            d={seg.d}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={`${seg.length} ${seg.length}`}
            strokeDashoffset={seg.length - visible[i]}
          />
        ) : null,
      )}
    </>
  );
};
