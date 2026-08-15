"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import dynamic from "next/dynamic";
import { UI, ZOOM } from "./intro-config";
import { StartButton } from "./start-button";
import { TitleZoomTransition } from "./title-zoom-transition";
import styles from "./intro.module.css";

// The Player is browser-only; the overlay shell itself is server-rendered
// so the black backdrop covers the page from the very first paint — the
// knowledge graph never flashes through.
const IntroPlayer = dynamic(() => import("./intro-player"), { ssr: false });

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const subscribeToReducedMotion = (onChange: () => void) => {
  const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
};

const usePrefersReducedMotion = (): boolean =>
  useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    // Server snapshot: assume motion is fine; corrected on hydration.
    () => false,
  );

const subscribeNever = () => () => {};

/** True when this browser tab has already played the intro. */
const useAlreadySeen = (): boolean =>
  useSyncExternalStore(
    subscribeNever,
    () =>
      UI.playOncePerTab &&
      window.sessionStorage.getItem(UI.sessionStorageKey) !== null,
    () => false,
  );

/**
 * Full-screen intro (the IntroPage layer) shown on top of the Select a
 * Concept page. Flow: the title reveals → START appears → on click, the
 * title flies toward the viewer (TitleZoomTransition) while the black
 * backdrop dissolves, revealing the page beneath — entering *through* the
 * title rather than a fade or reload. The concept page itself is untouched
 * and keeps loading its curriculum in the background.
 */
export const IntroOverlay = () => {
  const prefersReducedMotion = usePrefersReducedMotion();
  const alreadySeen = useAlreadySeen();
  const exitTimeoutRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<"intro" | "zoom" | "done">("intro");
  const [titleRevealed, setTitleRevealed] = useState(false);

  // With reduced motion there is no reveal animation to wait for.
  const showButton = titleRevealed || prefersReducedMotion;

  useEffect(() => {
    return () => {
      if (exitTimeoutRef.current !== null) {
        window.clearTimeout(exitTimeoutRef.current);
      }
    };
  }, []);

  const handleTitleRevealed = useCallback(() => setTitleRevealed(true), []);

  const handleStart = useCallback(() => {
    if (phase !== "intro") {
      return;
    }
    setPhase("zoom");
    const total = prefersReducedMotion
      ? UI.reducedMotionExitMs
      : ZOOM.pressMs + ZOOM.durationMs;
    // The "seen" flag is written only when the exit completes — writing it
    // here would flip useAlreadySeen mid-transition and unmount the overlay
    // before the fly-through plays.
    exitTimeoutRef.current = window.setTimeout(() => {
      window.sessionStorage.setItem(UI.sessionStorageKey, "1");
      setPhase("done");
    }, total);
  }, [phase, prefersReducedMotion]);

  if (alreadySeen || phase === "done") {
    return null;
  }

  const zooming = phase === "zoom";
  const cssVars = {
    "--reveal-delay": `${ZOOM.revealDelayMs}ms`,
    "--reveal-duration": `${ZOOM.revealDurationMs}ms`,
  } as React.CSSProperties;

  return (
    <div
      className={`${styles.overlay} ${zooming ? styles.overlayZooming : ""}`}
      style={cssVars}
      role="dialog"
      aria-label="Intro"
    >
      {/* The Player is swapped out for the zoom clone in the same commit,
          so the title never doubles or flickers. */}
      <div className={`${styles.stage} ${zooming ? styles.stageHidden : ""}`}>
        <IntroPlayer
          reducedMotion={prefersReducedMotion}
          onTitleRevealed={handleTitleRevealed}
        />
      </div>

      {zooming && !prefersReducedMotion ? <TitleZoomTransition /> : null}

      <StartButton
        visible={showButton}
        pressed={zooming}
        onClick={handleStart}
      />
    </div>
  );
};
