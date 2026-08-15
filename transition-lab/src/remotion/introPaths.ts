import { getLength, getPointAtLength } from "@remotion/paths";
import { TITLE, UNDERLINE, WRITING } from "../introConfig";

/**
 * The writing path is the single spine both layers share:
 *  - HandwrittenTitle sweeps its reveal mask along it (stroke-dash trick),
 *  - FlyingDrawingTool places the pen tip on it.
 * Because both read the same path at the same progress value, the visible
 * ink edge and the pen tip stay perfectly synchronized.
 *
 * It is a gentle, slightly irregular wave through the vertical middle of
 * the title — the irregularity is fixed (no Math.random()), so the render
 * is deterministic.
 */
const buildWritingPath = (): string => {
  const startX = TITLE.centerX - TITLE.textLength / 2 - WRITING.pathPadding;
  const endX = TITLE.centerX + TITLE.textLength / 2 + WRITING.pathPadding;
  const midY = TITLE.baselineY - TITLE.fontSize * 0.35;

  // Fixed per-segment wave weights: alternating signs with uneven
  // magnitudes read as "human", not sinusoidal.
  const weights = [0.9, -0.6, 1, -0.5, 0.75, 0];

  const dx = (endX - startX) / WRITING.waveSegments;
  let d = `M ${startX} ${midY}`;
  let prevX = startX;
  let prevY = midY;

  for (let i = 0; i < WRITING.waveSegments; i++) {
    const x = startX + dx * (i + 1);
    const y = midY + WRITING.waveAmplitude * weights[i];
    // Horizontal-tangent control points keep the wave smooth (C1 continuous
    // enough for the eye) without any cusps for the pen to snag on.
    d += ` C ${prevX + dx / 3} ${prevY}, ${x - dx / 3} ${y}, ${x} ${y}`;
    prevX = x;
    prevY = y;
  }
  return d;
};

/** The small finishing underline: a shallow bow with a lifted end. */
const buildUnderlinePath = (): string => {
  const { startX, endX, y, curveDip, endLift } = UNDERLINE;
  const w = endX - startX;
  return `M ${startX} ${y} C ${startX + w * 0.3} ${y + curveDip}, ${
    startX + w * 0.72
  } ${y + curveDip * 0.5}, ${endX} ${y - endLift}`;
};

export const WRITING_PATH = buildWritingPath();
export const WRITING_PATH_LENGTH = getLength(WRITING_PATH);

export const UNDERLINE_PATH = buildUnderlinePath();
export const UNDERLINE_PATH_LENGTH = getLength(UNDERLINE_PATH);

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const pointAt = (d: string, length: number): { x: number; y: number } => {
  const point = getPointAtLength(d, length);
  if (!point) {
    throw new Error(`Could not evaluate point on path: ${d}`);
  }
  return point;
};

/** Point on the writing path at progress 0..1. */
export const writingPointAt = (progress: number) =>
  pointAt(WRITING_PATH, clamp01(progress) * WRITING_PATH_LENGTH);

/** Point on the underline path at progress 0..1. */
export const underlinePointAt = (progress: number) =>
  pointAt(UNDERLINE_PATH, clamp01(progress) * UNDERLINE_PATH_LENGTH);
