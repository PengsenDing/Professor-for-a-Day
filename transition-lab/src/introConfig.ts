/**
 * Single source of truth for every tunable value of the whiteboard intro.
 * The Remotion composition (visual layer) and the React page (interaction
 * layer) both read from here and never hardcode these values themselves.
 *
 * All frame values assume `COMPOSITION.fps` (30fps → 30 frames = 1 second).
 */

export const COMPOSITION = {
  id: "IntroAnimation",
  width: 1920,
  height: 1080,
  fps: 30,
  /** Total length. The last frames are a stable hold for the START button. */
  durationInFrames: 238,
} as const;

export const COLORS = {
  /** Warm off-white whiteboard surface. */
  board: "#FAF8F3",
  /** Primary ink for the title and the drawing tool linework. */
  ink: "#1A1A1A",
  /** Softer gray for secondary strokes (underline, tool details). */
  inkSoft: "#3D3D3D",
  /** Barely-there gray used for shadows and board texture. */
  shadow: "#000000",
} as const;

/**
 * The animation timeline, expressed as frame boundaries.
 * Phases overlap slightly (e.g. the tool enters while the board is still
 * fading in) so the motion feels continuous rather than mechanical.
 */
export const PHASES = {
  boardRevealStart: 0,
  boardRevealEnd: 30,
  /** Tool flies in from the left on an upward arc. */
  enterStart: 20,
  enterEnd: 56,
  /** Title is written while the tool travels left → right. */
  writeStart: 56,
  writeEnd: 170,
  /** Brief pause at the last letter (the "pen lift"). */
  hoverEnd: 175,
  /** Pen swoops back left, lifted, to the underline start. */
  swoopEnd: 187,
  /** The small finishing underline stroke. */
  underlineStart: 187,
  underlineEnd: 203,
  /** Tool exits toward the right and fades. */
  exitStart: 203,
  exitEnd: 229,
} as const;

export const TITLE = {
  /** Exact wording and capitalization — do not alter. */
  text: "Professor of a Day",
  fontSize: 150,
  /** Center of the title on the 1920×1080 board. */
  centerX: 960,
  baselineY: 510,
  /**
   * The text is forced to exactly this width (SVG textLength), which keeps
   * the reveal mask, the tool path, and the glyphs in sync regardless of
   * font-loading timing.
   */
  textLength: 1150,
  /** Tiny rotation of the whole drawing for a hand-placed feel (degrees). */
  tiltDeg: -0.7,
} as const;

export const WRITING = {
  /**
   * The reveal mask is a thick stroke swept along the writing path with a
   * flat (butt) cap, so its leading edge sits exactly at the tool tip.
   * Must be tall enough to cover ascenders and descenders of the font.
   */
  maskStrokeWidth: 260,
  /** How far the writing path extends beyond the text on each side. */
  pathPadding: 30,
  /** Gentle vertical wave of the writing path (the hand bobbing). */
  waveAmplitude: 24,
  waveSegments: 6,
  /**
   * Writing pace: path progress (0..1) over frames. Slow segments are the
   * words; the short fast segments are the spaces between words, where the
   * pen also does a tiny lift-hop. Adjust `frames` to change writing speed.
   */
  keyframeFrames: [56, 112, 116, 128, 131, 138, 141, 170],
  keyframeValues: [0, 0.5, 0.553, 0.658, 0.711, 0.764, 0.817, 1],
  /** Frame ranges of the word gaps (used for the pen lift-hop). */
  gaps: [
    [112, 116],
    [128, 131],
    [138, 141],
  ],
  /** How high the pen hops between words, in px. */
  penLiftPx: 14,
} as const;

export const UNDERLINE = {
  startX: 760,
  endX: 1160,
  y: 592,
  /** Downward bow of the underline — the organic imperfection. */
  curveDip: 10,
  /** The stroke ends this many px higher, like a real flick of the wrist. */
  endLift: 6,
  strokeWidth: 5,
} as const;

export const TOOL = {
  /** Pen body length/width in px (line-art chalk marker). */
  bodyLength: 158,
  bodyWidth: 19,
  strokeWidth: 2.5,
  /** Rotation of the tool in each phase, degrees (0 = pointing right). */
  angles: {
    enter: -18,
    write: -38,
    hover: -28,
    underline: -40,
    exit: -22,
  },
  /** Flight curves (cubic bézier control points in board coordinates). */
  enterFrom: { x: -180, y: 860 },
  enterCp1: { x: 280, y: 300 },
  enterCp2: { x: 540, y: 330 },
  swoopCp1: { x: 1360, y: 640 },
  swoopCp2: { x: 950, y: 660 },
  exitCp1: { x: 1330, y: 540 },
  exitCp2: { x: 1620, y: 260 },
  exitTo: { x: 2160, y: 340 },
} as const;

export const BOARD = {
  /** Opacity of the paper-grain noise texture once revealed. */
  textureOpacity: 0.025,
  /** Opacity of the faint eraser smudges. */
  smudgeOpacity: 0.015,
  /** Soft darkening toward the board edges. */
  edgeShadeOpacity: 0.012,
} as const;

export const UI = {
  startLabel: "START",
  /** Frame at which the page reveals the START button (title complete). */
  buttonRevealFrame: PHASES.hoverEnd,
  /** Duration of the whiteboard-wipe exit transition. */
  wipeMs: 700,
  /** Exit duration when prefers-reduced-motion is set. */
  reducedMotionExitMs: 160,
  hoverScale: 1.04,
  pressedScale: 0.95,
} as const;

export const ROUTES = {
  intro: "/",
  selectConcept: "/select-concept",
} as const;
