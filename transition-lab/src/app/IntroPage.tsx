import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { useNavigate } from "react-router-dom";
import { IntroAnimation } from "../remotion/IntroAnimation";
import { COMPOSITION, ROUTES, UI } from "../introConfig";
import { StartButton } from "./StartButton";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const useViewportSize = () => {
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return size;
};

/**
 * Interaction layer around the whiteboard composition:
 * - plays the animation once via @remotion/player (no loop; the final
 *   frame is a stable hold, and moveToBeginningWhenEnded is disabled so
 *   it stays there),
 * - reveals the START button when the Player reaches the frame where the
 *   title is fully written (frameupdate event),
 * - on click, runs the whiteboard-wipe exit and navigates.
 * With prefers-reduced-motion, the Player shows the finished board as a
 * still image and the button is available immediately.
 */
export const IntroPage: React.FC = () => {
  const navigate = useNavigate();
  const prefersReducedMotion = usePrefersReducedMotion();
  const viewport = useViewportSize();
  const playerRef = useRef<PlayerRef>(null);
  const exitTimeoutRef = useRef<number | null>(null);

  const [showButton, setShowButton] = useState(prefersReducedMotion);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || prefersReducedMotion || showButton) {
      return;
    }
    const onFrame = (e: { detail: { frame: number } }) => {
      if (e.detail.frame >= UI.buttonRevealFrame) {
        setShowButton(true);
      }
    };
    player.addEventListener("frameupdate", onFrame);
    return () => player.removeEventListener("frameupdate", onFrame);
  }, [prefersReducedMotion, showButton]);

  useEffect(() => {
    return () => {
      if (exitTimeoutRef.current !== null) {
        window.clearTimeout(exitTimeoutRef.current);
      }
    };
  }, []);

  const handleStart = useCallback(() => {
    if (leaving) {
      return;
    }
    setLeaving(true);
    const delay = prefersReducedMotion
      ? UI.reducedMotionExitMs
      : UI.wipeMs;
    exitTimeoutRef.current = window.setTimeout(() => {
      navigate(ROUTES.selectConcept);
    }, delay);
  }, [leaving, prefersReducedMotion, navigate]);

  // "Contain" scaling: the whole board is always visible (nothing is
  // cropped on tablets); the page background matches the board color, so
  // any letterboxing is invisible.
  const containScale = Math.min(
    viewport.width / COMPOSITION.width,
    viewport.height / COMPOSITION.height,
  );
  const playerStyle = useMemo<React.CSSProperties>(
    () => ({
      position: "absolute",
      width: COMPOSITION.width * containScale,
      height: COMPOSITION.height * containScale,
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
    }),
    [containScale],
  );

  const cssVars = {
    "--wipe-ms": `${UI.wipeMs}ms`,
    "--hover-scale": String(UI.hoverScale),
    "--pressed-scale": String(UI.pressedScale),
  } as React.CSSProperties;

  return (
    <div className="intro-root" style={cssVars}>
      <div className={`intro-stage ${leaving ? "is-leaving" : ""}`}>
        <Player
          ref={playerRef}
          component={IntroAnimation}
          durationInFrames={COMPOSITION.durationInFrames}
          compositionWidth={COMPOSITION.width}
          compositionHeight={COMPOSITION.height}
          fps={COMPOSITION.fps}
          autoPlay={!prefersReducedMotion}
          initialFrame={
            prefersReducedMotion ? COMPOSITION.durationInFrames - 1 : 0
          }
          moveToBeginningWhenEnded={false}
          controls={false}
          clickToPlay={false}
          doubleClickToFullscreen={false}
          spaceKeyToPlayOrPause={false}
          style={playerStyle}
        />

        <StartButton
          visible={showButton}
          pressed={leaving}
          onClick={handleStart}
        />
      </div>

      {/* Whiteboard wipe: an off-white panel with a soft leading edge
          sweeps in from the left, then the router navigates. */}
      <div
        className={`board-wipe ${leaving ? "is-active" : ""}`}
        aria-hidden="true"
      />
    </div>
  );
};
