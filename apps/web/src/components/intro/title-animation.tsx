import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COLORS, COMPOSITION, DEPTH, TITLE } from "./intro-config";
import { LOOP_START_FRAME } from "./handwriting-path";
import { HandwrittenTitle, TITLE_ASPECT } from "./handwritten-title";

/**
 * Total composition length: the writing timeline (computed from the
 * strokes and the configured speeds) plus one full breathing cycle that
 * the Player loops seamlessly.
 */
export const INTRO_DURATION_FRAMES =
  LOOP_START_FRAME + COMPOSITION.breatheFrames;

/**
 * The intro visual: a clean warm-white canvas on which "Professor for a
 * Day" is written as a rounded pastel tube, stroke by stroke. All writing
 * logic lives in handwriting-path.ts; this component only maps the current
 * frame to the title state and adds a subtle idle shimmer of the sheen.
 */
export const TitleAnimation: React.FC = () => {
  const frame = useCurrentFrame();

  // Idle shimmer after the writing is done: a sine with exactly one cycle
  // per loop segment, so the loop point is invisible.
  const breathe =
    frame >= LOOP_START_FRAME
      ? Math.sin(
          (2 * Math.PI * (frame - LOOP_START_FRAME)) / COMPOSITION.breatheFrames,
        )
      : 0;
  const sheenPulse = 1 + DEPTH.sheen.breatheAmount * breathe;

  const titleHeight = TITLE.renderWidthPx * TITLE_ASPECT;

  return (
    <AbsoluteFill
      // Theme-aware: --intro-bg cascades from the overlay (intro.module.css);
      // the config color remains the fallback outside the overlay (Studio).
      style={{ backgroundColor: `var(--intro-bg, ${COLORS.background})` }}
    >
      {/* Flat background: any shading here would seam against the
          overlay's letterbox areas outside the 16:9 canvas. */}
      <div
        style={{
          position: "absolute",
          left: (COMPOSITION.width - TITLE.renderWidthPx) / 2,
          top: TITLE.centerY - titleHeight / 2,
        }}
      >
        <HandwrittenTitle
          frame={frame}
          widthPx={TITLE.renderWidthPx}
          sheenPulse={sheenPulse}
        />
      </div>
    </AbsoluteFill>
  );
};

export default TitleAnimation;
