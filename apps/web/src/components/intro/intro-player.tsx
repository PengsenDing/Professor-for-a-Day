"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { INTRO_DURATION_FRAMES, TitleAnimation } from "./title-animation";
import {
  BUTTON_REVEAL_FRAME,
  LOOP_START_FRAME,
} from "./handwriting-path";
import { COMPOSITION } from "./intro-config";

// The overlay paints the backdrop itself (plus the ambient symbol layer
// beneath the Player), so the canvas must not cover it.
const INPUT_PROPS = { transparentBackground: true } as const;

type IntroPlayerProps = {
  /** Show the finished title as a still image instead of animating. */
  reducedMotion: boolean;
  /** Called once, when the writing completes (START can appear). */
  onTitleRevealed: () => void;
};

// This module is only ever imported with ssr:false, so reading window in a
// state initializer is safe here.
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
 * The Remotion Player embed. Plays the handwriting once, then loops only
 * the idle "glow breathing" segment: when the first pass ends, playback is
 * looped over [LOOP_START_FRAME, end] — the breathing sine completes an
 * exact cycle there, so the loop point is invisible.
 */
export const IntroPlayer = ({
  reducedMotion,
  onTitleRevealed,
}: IntroPlayerProps) => {
  const playerRef = useRef<PlayerRef>(null);
  const viewport = useViewportSize();
  const notifiedRef = useRef(false);
  const [breathing, setBreathing] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      return;
    }
    const player = playerRef.current;
    if (!player) {
      return;
    }
    const onFrame = (e: { detail: { frame: number } }) => {
      if (!notifiedRef.current && e.detail.frame >= BUTTON_REVEAL_FRAME) {
        notifiedRef.current = true;
        onTitleRevealed();
      }
    };
    const onEnded = () => setBreathing(true);
    player.addEventListener("frameupdate", onFrame);
    player.addEventListener("ended", onEnded);
    return () => {
      player.removeEventListener("frameupdate", onFrame);
      player.removeEventListener("ended", onEnded);
    };
  }, [reducedMotion, onTitleRevealed]);

  useEffect(() => {
    if (breathing && !reducedMotion) {
      playerRef.current?.seekTo(LOOP_START_FRAME);
      playerRef.current?.play();
    }
  }, [breathing, reducedMotion]);

  // "Contain" scaling: the full 16:9 canvas is always visible; the canvas
  // is transparent over the overlay's own backdrop, so letterboxing is
  // invisible and the ambient symbols show through everywhere.
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

  return (
    <Player
      ref={playerRef}
      component={TitleAnimation}
      inputProps={INPUT_PROPS}
      durationInFrames={INTRO_DURATION_FRAMES}
      compositionWidth={COMPOSITION.width}
      compositionHeight={COMPOSITION.height}
      fps={COMPOSITION.fps}
      autoPlay={!reducedMotion}
      initialFrame={reducedMotion ? LOOP_START_FRAME : 0}
      loop={breathing}
      inFrame={breathing ? LOOP_START_FRAME : undefined}
      outFrame={INTRO_DURATION_FRAMES - 1}
      moveToBeginningWhenEnded={false}
      controls={false}
      clickToPlay={false}
      doubleClickToFullscreen={false}
      spaceKeyToPlayOrPause={false}
      style={playerStyle}
    />
  );
};

export default IntroPlayer;
