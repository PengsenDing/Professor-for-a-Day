"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LilyAnimationState } from "./types";

/** One-shot greeting length. Matches the performer's wave choreography. */
export const GREETING_MS = 2100;
/** How long the selection confirmation reads as its own state. */
export const SELECT_BURST_MS = 700;
/**
 * Quiet period after a greeting before another can start, so sweeping the
 * pointer on and off Lily can't machine-gun the wave.
 */
const GREETING_COOLDOWN_MS = 1400;

export interface LilyStateInput {
  isSpeaking: boolean;
  isListening: boolean;
  isSelected: boolean;
}

export interface LilyStateOutput {
  state: LilyAnimationState;
  /** 0..1 progress through the one-shot greeting. Read inside the frame loop. */
  greetProgress: () => number;
  /** 0..1 progress through the selection confirmation burst. */
  selectProgress: () => number;
  /** Ask for a greeting; ignored while one plays or during the cooldown. */
  requestGreeting: () => void;
}

/**
 * Resolves the external signals into exactly one animation state.
 *
 * Priority is `speaking > listening > selected > greeting > idle`. Speaking
 * and listening outrank the selection burst deliberately: cutting Lily's
 * mouth mid-sentence to acknowledge a click would look broken. The click is
 * still acknowledged — the bounce is an additive layer the performer applies
 * on top of whatever state is active, and the persistent selected ring is
 * pure CSS.
 *
 * Which state we are in is React state, because it changes the tree. *How
 * far through* a one-shot we are is a timestamp read straight from the
 * render loop, because a progress bar ticking at 60fps through React would
 * be 60 re-renders a second for nothing.
 */
export function useLilyState({
  isSpeaking,
  isListening,
  isSelected,
}: LilyStateInput): LilyStateOutput {
  const [greeting, setGreeting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const greetStartedAt = useRef(0);
  const greetEndedAt = useRef(Number.NEGATIVE_INFINITY);
  const selectStartedAt = useRef(0);
  const timers = useRef<number[]>([]);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current = timers.current.filter((t) => t !== id);
      fn();
    }, ms);
    timers.current.push(id);
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
    };
  }, []);

  const requestGreeting = useCallback(() => {
    const now = performance.now();
    if (greetStartedAt.current && now - greetStartedAt.current < GREETING_MS) return;
    if (now - greetEndedAt.current < GREETING_COOLDOWN_MS) return;
    greetStartedAt.current = now;
    setGreeting(true);
    schedule(() => {
      greetEndedAt.current = performance.now();
      setGreeting(false);
    }, GREETING_MS);
  }, [schedule]);

  /**
   * A fresh selection fires the confirmation burst once, on the rising edge
   * of `isSelected`.
   *
   * Both edges of `confirming` are driven by the clock rather than set
   * straight from the effect body: the burst is a timed external process,
   * and React state only mirrors whether one is in flight. The bounce itself
   * starts on the same frame regardless — the performer reads
   * `selectProgress()`, which is running from the timestamp below before
   * React has re-rendered anything.
   */
  const wasSelected = useRef(isSelected);
  useEffect(() => {
    const rising = isSelected && !wasSelected.current;
    wasSelected.current = isSelected;
    if (!rising) return;

    selectStartedAt.current = performance.now();
    const raf = requestAnimationFrame(() => setConfirming(true));
    const done = window.setTimeout(() => setConfirming(false), SELECT_BURST_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
    };
  }, [isSelected]);

  const greetProgress = useCallback(() => {
    if (!greetStartedAt.current) return 0;
    const t = (performance.now() - greetStartedAt.current) / GREETING_MS;
    return t >= 1 ? 0 : Math.max(t, 0);
  }, []);

  const selectProgress = useCallback(() => {
    if (!selectStartedAt.current) return 0;
    const t = (performance.now() - selectStartedAt.current) / SELECT_BURST_MS;
    return t >= 1 ? 0 : Math.max(t, 0);
  }, []);

  const state: LilyAnimationState = isSpeaking
    ? "speaking"
    : isListening
      ? "listening"
      : confirming
        ? "selected"
        : greeting
          ? "greeting"
          : "idle";

  return { state, greetProgress, selectProgress, requestGreeting };
}
