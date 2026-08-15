import React from "react";
import { evolvePath } from "@remotion/paths";
import { loadFont } from "@remotion/google-fonts/Caveat";
import { COLORS, COMPOSITION, TITLE, UNDERLINE, WRITING } from "../introConfig";
import { UNDERLINE_PATH, WRITING_PATH } from "./introPaths";

const { fontFamily } = loadFont();

type HandwrittenTitleProps = {
  /** 0..1 progress along the writing path (shared with the tool). */
  writeProgress: number;
  /** 0..1 progress of the finishing underline stroke. */
  underlineProgress: number;
};

/**
 * The handwriting effect: the title text is masked by a thick stroke that
 * is swept along the writing path with the stroke-dasharray trick
 * (evolvePath). The stroke uses a flat "butt" cap, so its leading edge is a
 * clean line sitting exactly at the current path point — the same point the
 * pen tip occupies — which makes the ink appear to flow out of the pen.
 *
 * `textLength` pins the rendered text to an exact width, so the mask, the
 * pen path, and the glyphs stay aligned no matter when the font loads.
 */
export const HandwrittenTitle: React.FC<HandwrittenTitleProps> = ({
  writeProgress,
  underlineProgress,
}) => {
  const maskDash = evolvePath(writeProgress, WRITING_PATH);
  const underlineDash = evolvePath(underlineProgress, UNDERLINE_PATH);

  return (
    <svg
      width={COMPOSITION.width}
      height={COMPOSITION.height}
      viewBox={`0 0 ${COMPOSITION.width} ${COMPOSITION.height}`}
      style={{ position: "absolute", inset: 0 }}
    >
      <defs>
        <mask id="title-reveal-mask" maskUnits="userSpaceOnUse">
          <path
            d={WRITING_PATH}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={WRITING.maskStrokeWidth}
            strokeLinecap="butt"
            strokeLinejoin="round"
            strokeDasharray={maskDash.strokeDasharray}
            strokeDashoffset={maskDash.strokeDashoffset}
          />
        </mask>
      </defs>

      <text
        x={TITLE.centerX}
        y={TITLE.baselineY}
        textAnchor="middle"
        fontFamily={fontFamily}
        fontSize={TITLE.fontSize}
        fill={COLORS.ink}
        textLength={TITLE.textLength}
        lengthAdjust="spacingAndGlyphs"
        mask="url(#title-reveal-mask)"
      >
        {TITLE.text}
      </text>

      <path
        d={UNDERLINE_PATH}
        fill="none"
        stroke={COLORS.inkSoft}
        strokeWidth={UNDERLINE.strokeWidth}
        strokeLinecap="round"
        strokeDasharray={underlineDash.strokeDasharray}
        strokeDashoffset={underlineDash.strokeDashoffset}
        opacity={underlineProgress > 0 ? 1 : 0}
      />
    </svg>
  );
};
