import React from "react";
import { DEPTH, STROKE } from "./intro-config";
import { StrokePaths } from "./stroke-paths";

type LayerProps = {
  /** Revealed length per stroke (depth layers always match the ink). */
  visible: number[];
};

/**
 * The soft gray shadow under the tube: the exact same dash-revealed paths,
 * nudged down-right, slightly thicker and blurred. Because it re-renders
 * the same strokes, it grows with the writing instead of popping in.
 * (Offsets are applied inside the Y-flipped group, hence the sign notes
 * in intro-config.)
 */
export const TitleShadow: React.FC<LayerProps> = ({ visible }) => {
  const s = DEPTH.shadow;
  return (
    <g
      transform={`translate(${s.offsetX} ${s.offsetY})`}
      style={{ filter: `blur(${s.blurUnits}px)` }}
      opacity={s.opacity}
    >
      <StrokePaths
        visible={visible}
        strokeWidth={STROKE.widthUnits * s.widthScale}
        stroke={s.color}
      />
    </g>
  );
};

type SheenProps = LayerProps & {
  /** 1 = configured intensity; the idle breathing modulates this. */
  pulse: number;
};

/**
 * The thin blurred white sheen on top of the tube — the top-light that
 * makes the stroke read as inflated and 3D rather than flat.
 */
export const TitleSheen: React.FC<SheenProps> = ({ visible, pulse }) => {
  const s = DEPTH.sheen;
  return (
    <g
      transform={`translate(${s.offsetX} ${s.offsetY})`}
      style={{ filter: `blur(${s.blurUnits}px)` }}
      opacity={Math.max(0, Math.min(1, s.opacity * pulse))}
    >
      <StrokePaths
        visible={visible}
        strokeWidth={STROKE.widthUnits * s.widthScale}
        stroke={s.color}
      />
    </g>
  );
};
