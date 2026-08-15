import React, { useMemo } from "react";
import { COLORS, STROKE } from "./intro-config";
import { FONT } from "./handwriting-glyphs";
import {
  getWritingState,
  TITLE_WIDTH_UNITS,
  WRITE_END_FRAME,
} from "./handwriting-path";
import { StrokePaths } from "./stroke-paths";
import { TitleShadow, TitleSheen } from "./title-glow";
import { WritingTip } from "./writing-tip";

/** Horizontal padding around the strokes (font units). */
const PAD_X = 220;
/** ViewBox vertical range in screen coords (after the Y flip). */
const VB_TOP = -FONT.ascent;
const VB_BOTTOM = 560; // Borel's f/y descender loops + the flourish swash
export const VIEWBOX_WIDTH = TITLE_WIDTH_UNITS + PAD_X * 2;
export const VIEWBOX_HEIGHT = VB_BOTTOM - VB_TOP;
/** Height/width ratio — lets callers derive rendered height from width. */
export const TITLE_ASPECT = VIEWBOX_HEIGHT / VIEWBOX_WIDTH;

type HandwrittenTitleProps = {
  /** Timeline frame; >= WRITE_END_FRAME renders the finished title. */
  frame: number;
  /** Rendered width in px (height follows TITLE_ASPECT). */
  widthPx: number;
  /** Sheen intensity multiplier (idle breathing modulates this). */
  sheenPulse?: number;
  /** Hide the writing tip (used by the zoom clone). */
  showTip?: boolean;
};

/**
 * The rounded-script title, written stroke by stroke. Centerline polylines
 * of the Borel glyphs are resampled as smooth Bézier splines (see
 * handwriting-path.ts), then rendered as three superimposed strokes of the
 * same paths — soft gray shadow, thick pastel-gradient tube, white sheen —
 * which together read as polished, inflated 3D lettering.
 *
 * The gradient is painted in user space across the full title width, so
 * every stroke picks up the hue of its horizontal position.
 * The font data is Y-up; the inner group flips it with scale(1,-1).
 */
export const HandwrittenTitle: React.FC<HandwrittenTitleProps> = ({
  frame,
  widthPx,
  sheenPulse = 1,
  showTip = true,
}) => {
  const state = useMemo(() => getWritingState(frame), [frame]);

  // Fade the tip in on entry and out right after the flourish completes.
  const tipOpacity =
    frame >= WRITE_END_FRAME
      ? Math.max(0, 1 - (frame - WRITE_END_FRAME) / 16)
      : Math.min(1, frame / 12);

  const gradient = COLORS.gradientStops;

  return (
    <svg
      width={widthPx}
      height={widthPx * TITLE_ASPECT}
      viewBox={`${-PAD_X} ${VB_TOP} ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        {/* User-space gradient across the whole title: strokes sample the
            color of wherever they sit horizontally. */}
        <linearGradient
          id="pastel-stroke-gradient"
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={0}
          x2={TITLE_WIDTH_UNITS}
          y2={0}
        >
          {gradient.map((color, i) => (
            <stop
              key={i}
              offset={i / (gradient.length - 1)}
              stopColor={color}
            />
          ))}
        </linearGradient>
        {/* The writing ball: white with a soft shaded lower edge. */}
        <radialGradient id="writing-tip-ball" cx="38%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="70%" stopColor="#F3F2F7" />
          <stop offset="100%" stopColor="#D9D7E4" />
        </radialGradient>
      </defs>

      {/* Font coordinates are Y-up; flip once for the screen. */}
      <g transform="scale(1,-1)">
        <TitleShadow visible={state.visible} />
        <StrokePaths
          visible={state.visible}
          strokeWidth={STROKE.widthUnits}
          stroke="url(#pastel-stroke-gradient)"
        />
        <TitleSheen visible={state.visible} pulse={sheenPulse} />
        {showTip ? (
          <WritingTip
            tip={state.tip}
            lifted={state.tipLifted}
            opacity={tipOpacity}
          />
        ) : null}
      </g>
    </svg>
  );
};
