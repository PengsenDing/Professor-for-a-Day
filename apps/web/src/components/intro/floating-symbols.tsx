import type { CSSProperties, ReactNode } from "react";
import { AMBIENT } from "./intro-config";
import styles from "./intro.module.css";

/**
 * The ambient scholarly backdrop of the intro: faint gray math formulas,
 * physics equations, and classic (public-domain) philosophy quotes drifting
 * slowly behind the handwritten title. Pure decoration — pointer-inert,
 * hidden from assistive tech, dissolved together with the backdrop on exit,
 * and static under prefers-reduced-motion (intro.module.css).
 *
 * The item table below is the tuning surface: positions are viewport
 * percentages, opacity multiplies onto rgba(--intro-ink) so the layer
 * follows light/dark automatically, and negative delays start each drift
 * mid-cycle so nothing moves in lockstep. Items overlapping the title band
 * (y ≈ 34–56%) are kept extra faint so the title stays the hero.
 */

type FontVoice = "serif" | "mono" | "quote" | "sans";

type AmbientItem = {
  node: ReactNode;
  font: FontVoice;
  /**
   * Position of the item's top corner, viewport percentages. Left corner
   * by default; right-anchored items measure x from the right edge instead,
   * so text near the edge shrinks the gap rather than clipping mid-word on
   * narrow viewports.
   */
  x: number;
  y: number;
  anchor?: "right";
  /** Font size in rem, before AMBIENT.sizeScale is applied. */
  size: number;
  /** Ink alpha (0–1); keep ≤ 0.2 so the backdrop never competes. */
  opacity: number;
  /** Static tilt in degrees. */
  rotate: number;
  /** Drift cycle length in seconds and phase offset (negative = mid-cycle). */
  duration: number;
  delay: number;
  /** Vertical bob amplitude in px. */
  drift: number;
  /** Set for quotes that should wrap into a block. */
  maxWidthEm?: number;
  /** Thin out the layer on small screens. */
  hideOnMobile?: boolean;
};

const ITEMS: AmbientItem[] = [
  // --- Mathematics ---
  {
    node: (
      <>
        e<sup>iπ</sup> + 1 = 0
      </>
    ),
    font: "serif",
    x: 6,
    y: 11,
    size: 1.5,
    opacity: 0.16,
    rotate: -8,
    duration: 26,
    delay: -4,
    drift: 16,
  },
  {
    node: <>P(A|B) = P(B|A) P(A) / P(B)</>,
    font: "mono",
    x: 6,
    anchor: "right",
    y: 8,
    size: 1.0,
    opacity: 0.14,
    rotate: 4,
    duration: 30,
    delay: -12,
    drift: 14,
    hideOnMobile: true,
  },
  {
    node: <>a² + b² = c²</>,
    font: "serif",
    x: 24,
    y: 19,
    size: 1.2,
    opacity: 0.12,
    rotate: -6,
    duration: 22,
    delay: -9,
    drift: 12,
    hideOnMobile: true,
  },
  {
    node: (
      <>
        ∫<sub>−∞</sub>
        <sup>∞</sup> e<sup>−x²</sup> dx = √π
      </>
    ),
    font: "serif",
    x: 54,
    y: 91,
    size: 1.25,
    opacity: 0.13,
    rotate: 5,
    duration: 28,
    delay: -17,
    drift: 15,
  },
  {
    node: (
      <>
        lim<sub>n→∞</sub> (1 + 1/n)<sup>n</sup> = e
      </>
    ),
    font: "mono",
    x: 37,
    y: 64,
    size: 0.95,
    opacity: 0.1,
    rotate: -4,
    duration: 24,
    delay: -2,
    drift: 12,
    hideOnMobile: true,
  },
  // --- Machine learning ---
  {
    node: <>θ ← θ − η ∇L(θ)</>,
    font: "mono",
    x: 4,
    anchor: "right",
    y: 76,
    size: 1.05,
    opacity: 0.15,
    rotate: 3,
    duration: 25,
    delay: -7,
    drift: 14,
  },
  {
    node: (
      <>
        σ(z) = 1 / (1 + e<sup>−z</sup>)
      </>
    ),
    font: "mono",
    x: 4,
    y: 47,
    size: 1.0,
    opacity: 0.09,
    rotate: -10,
    duration: 27,
    delay: -20,
    drift: 13,
    hideOnMobile: true,
  },
  {
    node: <>H(X) = −Σ p(x) log p(x)</>,
    font: "serif",
    x: 38,
    y: 2,
    size: 1.1,
    opacity: 0.12,
    rotate: 2,
    duration: 29,
    delay: -14,
    drift: 15,
  },
  {
    node: <>ŷ = Wx + b</>,
    font: "mono",
    x: 15,
    y: 61,
    size: 1.05,
    opacity: 0.12,
    rotate: 7,
    duration: 21,
    delay: -5,
    drift: 12,
    hideOnMobile: true,
  },
  {
    node: <>∂L/∂w</>,
    font: "mono",
    x: 4,
    anchor: "right",
    y: 13,
    size: 1.1,
    opacity: 0.12,
    rotate: 12,
    duration: 23,
    delay: -10,
    drift: 13,
  },
  // --- Physics ---
  {
    node: <>E = mc²</>,
    font: "sans",
    x: 6,
    anchor: "right",
    y: 30,
    size: 1.4,
    opacity: 0.15,
    rotate: 10,
    duration: 24,
    delay: -3,
    drift: 16,
  },
  {
    node: <>iħ ∂ψ/∂t = Ĥψ</>,
    font: "serif",
    x: 9,
    y: 79,
    size: 1.2,
    opacity: 0.14,
    rotate: -5,
    duration: 27,
    delay: -11,
    drift: 15,
  },
  {
    node: <>F = ma</>,
    font: "sans",
    x: 60,
    y: 25,
    size: 1.3,
    opacity: 0.11,
    rotate: 6,
    duration: 20,
    delay: -8,
    drift: 12,
    hideOnMobile: true,
  },
  {
    node: <>∇ × E = −∂B/∂t</>,
    font: "serif",
    x: 15,
    y: 88,
    size: 1.1,
    opacity: 0.13,
    rotate: -3,
    duration: 26,
    delay: -16,
    drift: 14,
    hideOnMobile: true,
  },
  {
    node: <>S = k log W</>,
    font: "sans",
    x: 4,
    anchor: "right",
    y: 56,
    size: 1.15,
    opacity: 0.11,
    rotate: 8,
    duration: 22,
    delay: -6,
    drift: 13,
  },
  // --- Philosophy (public-domain classics) ---
  {
    node: <>“Docendo discimus.” — Seneca</>,
    font: "quote",
    x: 3,
    anchor: "right",
    y: 64,
    size: 1.05,
    opacity: 0.16,
    rotate: -4,
    duration: 28,
    delay: -13,
    drift: 14,
  },
  {
    node: <>“The unexamined life is not worth living.” — Socrates</>,
    font: "quote",
    x: 5,
    y: 28,
    size: 0.95,
    opacity: 0.13,
    rotate: -3,
    duration: 30,
    delay: -19,
    drift: 13,
    maxWidthEm: 14,
  },
  {
    node: <>“Cogito, ergo sum.” — Descartes</>,
    font: "quote",
    x: 31,
    y: 74,
    size: 1.1,
    opacity: 0.14,
    rotate: 2,
    duration: 25,
    delay: -1,
    drift: 14,
  },
  {
    node: <>“Wisdom begins in wonder.” — Socrates</>,
    font: "quote",
    x: 58,
    y: 58,
    size: 1.0,
    opacity: 0.1,
    rotate: 5,
    duration: 27,
    delay: -22,
    drift: 12,
    hideOnMobile: true,
  },
  {
    node: (
      <>
        “The mind is not a vessel to be filled, but a fire to be kindled.” —
        Plutarch
      </>
    ),
    font: "quote",
    x: 47,
    y: 14,
    size: 0.95,
    opacity: 0.12,
    rotate: -2,
    duration: 29,
    delay: -15,
    drift: 13,
    maxWidthEm: 18,
    hideOnMobile: true,
  },
  {
    node: <>“I know that I know nothing.” — Socrates</>,
    font: "quote",
    x: 18,
    y: 39,
    size: 0.95,
    opacity: 0.09,
    rotate: -7,
    duration: 26,
    delay: -18,
    drift: 12,
    hideOnMobile: true,
  },
];

const FONT_CLASS: Record<FontVoice, string> = {
  serif: styles.ambientSerif,
  mono: styles.ambientMono,
  quote: styles.ambientQuote,
  sans: styles.ambientSans,
};

const layerStyle = {
  "--ambient-fade-duration": `${AMBIENT.fadeInMs}ms`,
  "--ambient-fade-delay": `${AMBIENT.fadeInDelayMs}ms`,
} as CSSProperties;

export const FloatingSymbols = () => (
  <div className={styles.ambientLayer} style={layerStyle} aria-hidden="true">
    {ITEMS.map((item, index) => (
      <span
        key={index}
        className={[
          styles.ambientItem,
          FONT_CLASS[item.font],
          item.anchor === "right" ? styles.ambientRight : "",
          item.maxWidthEm !== undefined ? styles.ambientWraps : "",
          item.hideOnMobile ? styles.ambientMobileHidden : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          {
            "--x": `${item.x}%`,
            "--y": `${item.y}%`,
            "--o": item.opacity,
            "--rot": `${item.rotate}deg`,
            "--dur": `${item.duration}s`,
            "--delay": `${item.delay}s`,
            "--drift": `${item.drift}px`,
            fontSize: `${item.size * AMBIENT.sizeScale}rem`,
            maxWidth:
              item.maxWidthEm !== undefined ? `${item.maxWidthEm}em` : undefined,
          } as CSSProperties
        }
      >
        {item.node}
      </span>
    ))}
  </div>
);
