import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { COMPOSITION, PHASES, TITLE, TOOL, WRITING } from "../introConfig";
import { underlinePointAt, writingPointAt } from "./introPaths";
import { WhiteboardBackground } from "./WhiteboardBackground";
import { HandwrittenTitle } from "./HandwrittenTitle";
import { FlyingDrawingTool, type ToolState } from "./FlyingDrawingTool";

type Point = { x: number; y: number };

/** Point on a cubic bézier at parameter t (0..1). */
const cubicBezier = (
  t: number,
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
): Point => {
  const u = 1 - t;
  return {
    x:
      u * u * u * p0.x +
      3 * u * u * t * p1.x +
      3 * u * t * t * p2.x +
      t * t * t * p3.x,
    y:
      u * u * u * p0.y +
      3 * u * u * t * p1.y +
      3 * u * t * t * p2.y +
      t * t * t * p3.y,
  };
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/**
 * The pen's whole journey, one function of the current frame:
 *   enter (flight arc) → write (on the writing path) → hover (pen lift)
 *   → swoop (flight back to the underline) → underline → exit (flight arc).
 * During "write" and "underline" the tip is placed with the SAME path +
 * progress the title mask uses, which is what keeps ink and pen in sync.
 */
const getToolState = (frame: number): ToolState => {
  const writeStartPoint = writingPointAt(0);
  const writeEndPoint = writingPointAt(1);
  const underlineStartPoint = underlinePointAt(0);
  const underlineEndPoint = underlinePointAt(1);

  // Shared writing progress (also used by the mask): slow over words,
  // quick over the word gaps.
  const writeProgress = interpolate(
    frame,
    [...WRITING.keyframeFrames],
    [...WRITING.keyframeValues],
    { ...clamp, easing: Easing.inOut(Easing.sin) },
  );

  // Small lift-hop while crossing each word gap (sin gives a smooth
  // up-and-down envelope within the gap's frame range).
  const penLift = WRITING.gaps.reduce((lift, [gapStart, gapEnd]) => {
    const t = interpolate(frame, [gapStart, gapEnd], [0, 1], clamp);
    return lift + Math.sin(t * Math.PI) * WRITING.penLiftPx;
  }, 0);

  const fadeIn = interpolate(
    frame,
    [PHASES.enterStart, PHASES.enterStart + 6],
    [0, 1],
    clamp,
  );
  const fadeOut = interpolate(
    frame,
    [PHASES.exitEnd - 8, PHASES.exitEnd],
    [1, 0],
    clamp,
  );

  // --- Phase: entrance flight (arc up from bottom-left, settle on start).
  if (frame < PHASES.enterEnd) {
    const t = interpolate(frame, [PHASES.enterStart, PHASES.enterEnd], [0, 1], {
      ...clamp,
      easing: Easing.inOut(Easing.cubic),
    });
    const pos = cubicBezier(
      t,
      TOOL.enterFrom,
      TOOL.enterCp1,
      TOOL.enterCp2,
      writeStartPoint,
    );
    return {
      ...pos,
      rotationDeg: interpolate(t, [0, 1], [TOOL.angles.enter, TOOL.angles.write]),
      opacity: fadeIn,
      contact: interpolate(t, [0.85, 1], [0, 1], clamp),
    };
  }

  // --- Phase: writing (tip rides the writing path).
  if (frame < PHASES.writeEnd) {
    const pos = writingPointAt(writeProgress);
    return {
      x: pos.x,
      y: pos.y - penLift,
      rotationDeg: TOOL.angles.write,
      opacity: 1,
      contact: penLift > 1 ? 0 : 1,
    };
  }

  // --- Phase: hover (brief pause; the pen lifts slightly off the board).
  if (frame < PHASES.hoverEnd) {
    const t = interpolate(frame, [PHASES.writeEnd, PHASES.hoverEnd], [0, 1], {
      ...clamp,
      easing: Easing.out(Easing.quad),
    });
    return {
      x: writeEndPoint.x,
      y: writeEndPoint.y - t * 16,
      rotationDeg: interpolate(t, [0, 1], [TOOL.angles.write, TOOL.angles.hover]),
      opacity: 1,
      contact: 1 - t,
    };
  }

  // --- Phase: swoop (lifted flight back to the underline start).
  if (frame < PHASES.swoopEnd) {
    const t = interpolate(frame, [PHASES.hoverEnd, PHASES.swoopEnd], [0, 1], {
      ...clamp,
      easing: Easing.inOut(Easing.cubic),
    });
    const pos = cubicBezier(
      t,
      { x: writeEndPoint.x, y: writeEndPoint.y - 16 },
      TOOL.swoopCp1,
      TOOL.swoopCp2,
      underlineStartPoint,
    );
    return {
      ...pos,
      rotationDeg: interpolate(
        t,
        [0, 1],
        [TOOL.angles.hover, TOOL.angles.underline],
      ),
      opacity: 1,
      contact: interpolate(t, [0.8, 1], [0, 1], clamp),
    };
  }

  // --- Phase: underline (tip rides the underline path).
  if (frame < PHASES.underlineEnd) {
    const t = interpolate(
      frame,
      [PHASES.underlineStart, PHASES.underlineEnd],
      [0, 1],
      { ...clamp, easing: Easing.inOut(Easing.cubic) },
    );
    const pos = underlinePointAt(t);
    return {
      ...pos,
      rotationDeg: TOOL.angles.underline,
      opacity: 1,
      contact: 1,
    };
  }

  // --- Phase: exit flight (arc away to the right, fading at the end).
  const t = interpolate(frame, [PHASES.exitStart, PHASES.exitEnd], [0, 1], {
    ...clamp,
    easing: Easing.in(Easing.cubic),
  });
  const pos = cubicBezier(
    t,
    underlineEndPoint,
    TOOL.exitCp1,
    TOOL.exitCp2,
    TOOL.exitTo,
  );
  return {
    ...pos,
    rotationDeg: interpolate(
      t,
      [0, 1],
      [TOOL.angles.underline, TOOL.angles.exit],
    ),
    opacity: fadeOut,
    contact: interpolate(t, [0, 0.15], [1, 0], clamp),
  };
};

export const IntroAnimation: React.FC = () => {
  const frame = useCurrentFrame();

  const boardReveal = interpolate(
    frame,
    [PHASES.boardRevealStart, PHASES.boardRevealEnd],
    [0, 1],
    { ...clamp, easing: Easing.out(Easing.quad) },
  );

  // The exact same progress values drive the mask (HandwrittenTitle) and
  // the pen tip (getToolState) — this is the synchronization contract.
  const writeProgress = interpolate(
    frame,
    [...WRITING.keyframeFrames],
    [...WRITING.keyframeValues],
    { ...clamp, easing: Easing.inOut(Easing.sin) },
  );
  const underlineProgress = interpolate(
    frame,
    [PHASES.underlineStart, PHASES.underlineEnd],
    [0, 1],
    { ...clamp, easing: Easing.inOut(Easing.cubic) },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#FFFFFF" }}>
      <WhiteboardBackground reveal={boardReveal} />

      {/* One wrapper carries the tiny hand-placed tilt, so the title, the
          mask, and the pen all rotate together and stay aligned. */}
      <AbsoluteFill
        style={{
          rotate: `${TITLE.tiltDeg}deg`,
          transformOrigin: `${COMPOSITION.width / 2}px ${
            COMPOSITION.height / 2
          }px`,
        }}
      >
        <HandwrittenTitle
          writeProgress={writeProgress}
          underlineProgress={underlineProgress}
        />
        <FlyingDrawingTool {...getToolState(frame)} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
