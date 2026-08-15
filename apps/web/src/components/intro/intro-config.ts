/**
 * Single source of truth for every tunable value of the intro.
 * The Remotion composition (handwritten title), the zoom transition, and
 * the overlay all read from here and never hardcode these values.
 *
 * Frame values assume `COMPOSITION.fps` (30fps → 30 frames = 1 second).
 * "Units" are font units of the single-line script (1000 per em); the
 * whole title is scaled to `TITLE.renderWidthPx` on the 1920×1080 canvas.
 */

export const COMPOSITION = {
  id: "IntroAnimation",
  width: 1920,
  height: 1080,
  fps: 30,
  /**
   * After the writing completes, the glow breathes on a seamless loop this
   * long (the breathing sine completes exactly one cycle per loop).
   */
  breatheFrames: 180,
} as const;

export const COLORS = {
  /** Clean, very light warm-white intro backdrop. */
  background: "#FAFAF8",
  /**
   * The pastel hue sweep along the stroke, left → right: soft blue, cyan,
   * green, yellow, orange, pink, purple, lavender — soft and harmonious.
   */
  gradientStops: [
    "#5B8FE0",
    "#3FB4C4",
    "#4FBC72",
    "#D2B54A",
    "#E28B4D",
    "#E0619A",
    "#8E5FD6",
    "#A186E6",
  ],
} as const;

export const TITLE = {
  /** Exact wording and capitalization — do not alter. */
  text: "Professor for a Day",
  /** Width of the written title on the 1920×1080 canvas (title scale). */
  renderWidthPx: 1300,
  /** Vertical center of the title on the canvas. */
  centerY: 500,
} as const;

export const STROKE = {
  /**
   * Stroke width of the rounded tube, in font units (~1000/em). Matches
   * the measured stroke weight of Borel-Regular, so the tube drawn along
   * the glyph centerlines reproduces the real letterforms.
   */
  widthUnits: 89,
  /** Diameter of the writing tip's ball, font units. */
  tipSizeUnits: 98,
} as const;

/**
 * The "inflated 3D tube" look = three strokes of the exact same paths:
 * a soft offset gray shadow underneath, the pastel gradient tube, and a
 * thin blurred white sheen on top. Offsets are in font units (Y-up: a
 * negative offsetY moves DOWN on screen, positive moves up).
 */
export const DEPTH = {
  shadow: {
    color: "#3A3F4A",
    opacity: 0.2,
    blurUnits: 17,
    widthScale: 1.06,
    offsetX: 5,
    offsetY: -42,
  },
  sheen: {
    color: "#FFFFFF",
    opacity: 0.32,
    blurUnits: 8,
    widthScale: 0.24,
    offsetX: -8,
    offsetY: 20,
    /** Subtle idle shimmer of the sheen (fraction of its opacity). */
    breatheAmount: 0.1,
  },
} as const;

export const WRITING = {
  /** Ink speed: font units of stroke drawn per frame (writing speed). */
  drawUnitsPerFrame: 105,
  /** Travel speed of the lifted pen between strokes, units per frame. */
  moveUnitsPerFrame: 340,
  /** Minimum frames for any pen-lift hop (keeps tiny hops visible). */
  minMoveFrames: 2,
  /** Extra pause when the pen crosses a word gap (frames). */
  wordPauseFrames: 7,
  /** Where the tip enters from, left of the title (font units). */
  entryDistanceUnits: 900,
  entryFrames: 22,
  /** How high the lifted pen arcs during hops (font units). */
  liftArcUnits: 70,
  /** Hold after the flourish before the button appears (frames). */
  holdFrames: 10,
} as const;

/**
 * The click transition: the handwritten title flies toward the viewer and
 * past the camera while the black backdrop dissolves into the page.
 */
export const ZOOM = {
  /** Button press feedback before the title starts moving. */
  pressMs: 300,
  /** Length of the fly-through itself (transition duration). */
  durationMs: 1500,
  /** How far past the camera the title scales (viewport-filling). */
  maxScale: 26,
  /** Peak of the motion-blur approximation during the zoom. */
  maxBlurPx: 14,
  /** When (after click) the black backdrop starts revealing the page. */
  revealDelayMs: 1100,
  revealDurationMs: 600,
} as const;

export const UI = {
  startLabel: "START",
  /** Exit duration when prefers-reduced-motion is set. */
  reducedMotionExitMs: 200,
  /**
   * The intro plays once per browser tab (sessionStorage). Set to false to
   * replay it on every visit to the home page.
   */
  playOncePerTab: true,
  sessionStorageKey: "pfad-intro-seen",
} as const;
