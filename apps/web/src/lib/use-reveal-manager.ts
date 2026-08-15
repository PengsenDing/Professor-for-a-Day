"use client";

// React owner of the active word-by-word reveals (pacing math lives in
// reveal.ts). One rAF loop runs only while something is animating and
// publishes to state only when a visible word count actually changes.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  revealedWordCount,
  splitWords,
  startFallback,
  toAudioPhase,
  type RevealPhase,
} from "./reveal";

interface ActiveReveal {
  tokens: string[];
  phase: RevealPhase;
  msPerWord: number;
  audio: HTMLAudioElement | null;
  count: number;
}

export interface RevealManager {
  /** Starts revealing a message. No-op when disabled or for 0–1 word texts. */
  begin: (id: string, text: string, msPerWord: number) => void;
  /** Re-paces the remaining words of a reveal across the audio's duration. */
  attachAudio: (id: string, audio: HTMLAudioElement) => void;
  /** Drops back to fallback pacing from the current position. */
  detachAudio: (id: string) => void;
  detachAllAudio: () => void;
  /** Completes one reveal instantly. */
  skip: (id: string) => void;
  /** Completes every running reveal instantly. */
  skipAll: () => void;
  /** id → currently visible prefix. An id absent here renders its full text. */
  revealTexts: Record<string, string>;
}

export function useRevealManager(enabled: boolean): RevealManager {
  const items = useRef(new Map<string, ActiveReveal>());
  const [revealTexts, setRevealTexts] = useState<Record<string, string>>({});
  const rafId = useRef<number | null>(null);
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const publish = useCallback(() => {
    const map: Record<string, string> = {};
    items.current.forEach((r, id) => {
      map[id] = r.tokens.slice(0, r.count).join("");
    });
    setRevealTexts(map);
  }, []);

  const ensureLoop = useCallback(() => {
    if (rafId.current !== null || items.current.size === 0) return;
    const step = () => {
      const now = performance.now();
      let changed = false;
      items.current.forEach((r, id) => {
        const clock =
          r.audio && Number.isFinite(r.audio.duration) && r.audio.duration > 0
            ? { currentTime: r.audio.currentTime, duration: r.audio.duration }
            : null;
        // max() keeps the reveal monotonic even if the audio clock rewinds
        // (e.g. the learner replays a turn that is still revealing).
        const next = Math.max(
          r.count,
          revealedWordCount(r.phase, r.tokens.length, now, r.msPerWord, clock),
        );
        if (next !== r.count) {
          r.count = next;
          changed = true;
        }
        if (r.count >= r.tokens.length) {
          items.current.delete(id);
          changed = true;
        }
      });
      if (changed) publish();
      rafId.current =
        items.current.size > 0 ? requestAnimationFrame(step) : null;
    };
    rafId.current = requestAnimationFrame(step);
  }, [publish]);

  const begin = useCallback(
    (id: string, text: string, msPerWord: number) => {
      if (!enabledRef.current) return;
      const tokens = splitWords(text);
      if (tokens.length <= 1) return;
      items.current.set(id, {
        tokens,
        phase: startFallback(0, performance.now()),
        msPerWord,
        audio: null,
        count: 1,
      });
      publish();
      ensureLoop();
    },
    [ensureLoop, publish],
  );

  const attachAudio = useCallback((id: string, audio: HTMLAudioElement) => {
    const r = items.current.get(id);
    if (!r) return;
    r.audio = audio;
    r.phase = toAudioPhase(r.count);
  }, []);

  const detachAudio = useCallback((id: string) => {
    const r = items.current.get(id);
    if (!r?.audio) return;
    r.audio = null;
    r.phase = startFallback(r.count, performance.now());
  }, []);

  const detachAllAudio = useCallback(() => {
    const now = performance.now();
    items.current.forEach((r) => {
      if (!r.audio) return;
      r.audio = null;
      r.phase = startFallback(r.count, now);
    });
  }, []);

  const skip = useCallback(
    (id: string) => {
      if (!items.current.delete(id)) return;
      publish();
    },
    [publish],
  );

  const skipAll = useCallback(() => {
    if (items.current.size === 0) return;
    items.current.clear();
    publish();
  }, [publish]);

  // prefers-reduced-motion flipping on mid-session completes everything.
  useEffect(() => {
    if (!enabled) skipAll();
  }, [enabled, skipAll]);

  useEffect(() => {
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    };
  }, []);

  return {
    begin,
    attachAudio,
    detachAudio,
    detachAllAudio,
    skip,
    skipAll,
    revealTexts,
  };
}
