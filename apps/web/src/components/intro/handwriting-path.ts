import { getLength, getPointAtLength } from "@remotion/paths";
import { FONT } from "./handwriting-glyphs";
import { TITLE, WRITING } from "./intro-config";

/**
 * The writing engine. It lays the single-line glyphs out along the
 * baseline, splits them into their real pen strokes (subpaths), and builds
 * a deterministic frame timeline that alternates between:
 *
 *   draw  — ink flows: the stroke is dash-revealed at constant speed while
 *           the tip sits exactly at the reveal edge (same path, same
 *           progress — they cannot drift apart), and
 *   move  — pen lift: the tip travels to the next stroke's start with a
 *           small arc and no ink; crossing a word gap adds a brief pause.
 *
 * Everything is precomputed at module load from intro-config values, so
 * the animation is deterministic and the composition duration is static.
 */

export type Point = { x: number; y: number };

type DrawSegment = {
  kind: "draw";
  /** Subpath in laid-out title coordinates (offsets baked in). */
  d: string;
  length: number;
  startFrame: number;
  endFrame: number;
};

type MoveSegment = {
  kind: "move";
  from: Point;
  to: Point;
  startFrame: number;
  endFrame: number;
};

export type Segment = DrawSegment | MoveSegment;

const pointAt = (d: string, length: number): Point => {
  const p = getPointAtLength(d, length);
  if (!p) {
    throw new Error("Could not evaluate point on stroke");
  }
  return p;
};

/** Split an absolute-command path into its pen strokes (subpaths). */
const splitSubpaths = (d: string): string[] =>
  d
    .split(/(?=M)/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Parse an absolute M/L subpath into points, shifted right by dx. */
const parsePoints = (d: string, dx: number): Point[] => {
  const tokens = d.match(/[A-Za-z]|-?[\d.]+(?:e-?\d+)?/g) ?? [];
  const points: Point[] = [];
  let x: number | null = null;
  for (const token of tokens) {
    if (/[A-Za-z]/.test(token)) {
      if (token !== "M" && token !== "L") {
        throw new Error(`Unsupported path command "${token}" in glyph data`);
      }
      continue;
    }
    if (x === null) {
      x = Number(token) + dx;
    } else {
      points.push({ x, y: Number(token) });
      x = null;
    }
  }
  return points;
};

/**
 * Resample a polyline as a smooth cubic-Bézier spline (Catmull-Rom).
 * The source glyphs are uniformly sampled centerline polylines; drawn
 * thick, their corners would read as "rough handwriting". Routing one
 * C-curve through every point keeps the continuous, designed look of the
 * Borel script. Offsets are baked in, so all strokes share ONE
 * coordinate space (which the userSpaceOnUse gradient requires).
 */
const smoothPath = (points: Point[]): string => {
  if (points.length < 2) {
    return points.length
      ? `M ${points[0].x} ${points[0].y} L ${points[0].x} ${points[0].y}`
      : "";
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
};

type LaidOutStroke = {
  d: string;
  length: number;
  start: Point;
  end: Point;
  afterWordGap: boolean;
};

const layoutStrokes = (): { strokes: LaidOutStroke[]; width: number } => {
  const strokes: LaidOutStroke[] = [];
  let x = 0;
  let afterWordGap = false;
  for (const ch of TITLE.text) {
    const glyph = FONT.glyphs[ch];
    if (!glyph) {
      throw new Error(`Missing glyph for ${JSON.stringify(ch)}`);
    }
    if (ch === " ") {
      afterWordGap = true;
      x += glyph.adv;
      continue;
    }
    for (const local of splitSubpaths(glyph.d)) {
      const d = smoothPath(parsePoints(local, x));
      const length = getLength(d);
      strokes.push({
        d,
        length,
        start: pointAt(d, 0),
        end: pointAt(d, length),
        afterWordGap,
      });
      afterWordGap = false;
    }
    x += glyph.adv;
  }
  return { strokes, width: x };
};

const laidOut = layoutStrokes();

/** Total advance width of the title in font units. */
export const TITLE_WIDTH_UNITS = laidOut.width;

/**
 * The finishing flourish: a single relaxed swash drawn under the second
 * half of the title after the last letter, in laid-out coordinates
 * (Y-up, baseline 0 — negative y is below the baseline).
 */
const FLOURISH_D = (() => {
  const w = TITLE_WIDTH_UNITS;
  return `M ${w * 0.42} -300 C ${w * 0.55} -395, ${w * 0.75} -380, ${w * 0.94} -270`;
})();

/** Build the frame timeline from the laid-out strokes. */
const buildTimeline = (): { segments: Segment[]; writeEndFrame: number } => {
  const segments: Segment[] = [];
  let frame = 0;
  let pen: Point = { x: -WRITING.entryDistanceUnits, y: 0 };

  const move = (to: Point, opts?: { frames?: number; pause?: boolean }) => {
    const dist = Math.hypot(to.x - pen.x, to.y - pen.y);
    const frames =
      opts?.frames ??
      Math.max(
        WRITING.minMoveFrames,
        Math.round(dist / WRITING.moveUnitsPerFrame) +
          (opts?.pause ? WRITING.wordPauseFrames : 0),
      );
    segments.push({
      kind: "move",
      from: pen,
      to,
      startFrame: frame,
      endFrame: frame + frames,
    });
    frame += frames;
    pen = to;
  };

  const draw = (d: string, length: number, end: Point) => {
    const frames = Math.max(2, Math.round(length / WRITING.drawUnitsPerFrame));
    segments.push({
      kind: "draw",
      d,
      length,
      startFrame: frame,
      endFrame: frame + frames,
    });
    frame += frames;
    pen = end;
  };

  for (const [i, stroke] of laidOut.strokes.entries()) {
    move(stroke.start, {
      frames: i === 0 ? WRITING.entryFrames : undefined,
      pause: stroke.afterWordGap,
    });
    draw(stroke.d, stroke.length, stroke.end);
  }

  // Finishing flourish: swing below the title, sweep the swash.
  const flourishLength = getLength(FLOURISH_D);
  move(pointAt(FLOURISH_D, 0), { pause: true });
  draw(FLOURISH_D, flourishLength, pointAt(FLOURISH_D, flourishLength));

  return { segments, writeEndFrame: frame };
};

const timeline = buildTimeline();

export const SEGMENTS = timeline.segments;
export const DRAW_SEGMENTS = SEGMENTS.filter(
  (s): s is DrawSegment => s.kind === "draw",
);

/** Frame at which the last stroke (incl. flourish) is complete. */
export const WRITE_END_FRAME = timeline.writeEndFrame;
/** Frame at which the idle glow-breathing loop starts. */
export const LOOP_START_FRAME = WRITE_END_FRAME + WRITING.holdFrames;
/** Frame at which the START button may appear. */
export const BUTTON_REVEAL_FRAME = WRITE_END_FRAME + 6;

export type WritingState = {
  /** Revealed length per draw stroke, aligned with DRAW_SEGMENTS. */
  visible: number[];
  /** Writing-tip position in laid-out font units, or null when done. */
  tip: Point | null;
  /** True while the pen is lifted (traveling without ink). */
  tipLifted: boolean;
};

/** Resolve the full writing state for a frame — pure and deterministic. */
export const getWritingState = (frame: number): WritingState => {
  const visible: number[] = [];
  let tip: Point | null = null;
  let tipLifted = false;

  for (const seg of SEGMENTS) {
    if (seg.kind === "draw") {
      const t =
        frame >= seg.endFrame
          ? 1
          : frame <= seg.startFrame
            ? 0
            : (frame - seg.startFrame) / (seg.endFrame - seg.startFrame);
      visible.push(seg.length * t);
      if (t > 0 && t < 1 && tip === null) {
        tip = pointAt(seg.d, seg.length * t);
      }
    } else if (
      tip === null &&
      frame >= seg.startFrame &&
      frame < seg.endFrame
    ) {
      const t = (frame - seg.startFrame) / (seg.endFrame - seg.startFrame);
      // Lifted pen: straight travel with a small arc upward.
      tip = {
        x: seg.from.x + (seg.to.x - seg.from.x) * t,
        y:
          seg.from.y +
          (seg.to.y - seg.from.y) * t +
          Math.sin(t * Math.PI) * WRITING.liftArcUnits,
      };
      tipLifted = true;
    }
  }

  // Exactly at a draw boundary: park the tip on the just-finished stroke.
  if (tip === null && frame < WRITE_END_FRAME) {
    const current = SEGMENTS.find((s) => frame < s.endFrame);
    if (current) {
      tip =
        current.kind === "draw"
          ? pointAt(current.d, frame <= current.startFrame ? 0 : current.length)
          : current.from;
    }
  }

  return { visible, tip, tipLifted };
};
