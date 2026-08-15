"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useLilyState } from "./use-lily-state";
import { useModelAvailability } from "./use-model-availability";
import type { LilyAnimationState } from "./types";

/**
 * WebGL is loaded only when a Lily is actually on screen, and never during
 * SSR — three.js is by far the heaviest thing on the setup page.
 */
const LilyCanvas = dynamic(() => import("./lily-canvas"), { ssr: false });

/** Where the generated model is expected to live. See ./README.md. */
export const DEFAULT_LILY_MODEL_URL = "/models/lily.glb";
/** 2D poster used while WebGL boots, and if it cannot start at all. */
const POSTER_SRC = "/avatars/lily.png";

export interface LilyAvatarProps {
  /** GLB to load. Falls back to the built-in 3D stand-in when absent. */
  modelUrl?: string;
  /** True while the microphone is capturing the learner. */
  isListening?: boolean;
  /** True while AI Student audio is playing. */
  isSpeaking?: boolean;
  /** True when Lily is the chosen student. */
  isSelected?: boolean;
  /** Provided => the avatar becomes a real button. Omit for display-only use. */
  onSelect?: () => void;
  /** Change this value to make Lily greet the user from outside. */
  greetSignal?: number | string;
  /** Reported on every transition, for callers that mirror her state. */
  onStateChange?: (state: LilyAnimationState) => void;
  /** Accessible name of the control. */
  label?: string;
  className?: string;
}

/** `prefers-reduced-motion`, kept live so a mid-session change is honoured. */
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * True while the element is on screen.
 *
 * Deliberately *not* also gated on `document.hidden`: browsers already stop
 * serving requestAnimationFrame to hidden tabs, so a second gate buys no CPU
 * and only makes the component untestable in headless browsers, which report
 * themselves as permanently hidden.
 */
function useIsOnScreen(ref: React.RefObject<HTMLElement | null>) {
  // Starts true and is only ever *lowered* by the observer: Lily should be
  // alive on her first frame rather than frozen until a callback lands, and
  // environments without a working observer keep animating instead of
  // silently freezing.
  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      { rootMargin: "120px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return onScreen;
}

/**
 * Lily, rendered in 3D inside a circular avatar container.
 *
 * The component owns her *performance* — idle, greeting, speaking, listening
 * and the selection confirmation, plus hover and pointer-leave behaviour. It
 * owns none of the application's state: whether the learner is talking,
 * whether audio is playing and whether she is the chosen student all arrive
 * as props, so the same component works on the setup page and later inside a
 * Teaching Session.
 */
export function LilyAvatar({
  modelUrl = DEFAULT_LILY_MODEL_URL,
  isListening = false,
  isSpeaking = false,
  isSelected = false,
  onSelect,
  greetSignal,
  onStateChange,
  label = "Select Lily as your student",
  className,
}: LilyAvatarProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const active = useIsOnScreen(hostRef);
  const [modelBroken, setModelBroken] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);

  const availability = useModelAvailability(modelUrl);
  const resolvedUrl =
    availability === "available" && !modelBroken ? modelUrl : undefined;
  const usingStandIn = availability !== "probing" && resolvedUrl === undefined;

  const { state, greetProgress, selectProgress, requestGreeting } = useLilyState({
    isSpeaking,
    isListening,
    isSelected,
  });

  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  // External greeting requests (e.g. "the AI Student just joined").
  const firstSignal = useRef(true);
  useEffect(() => {
    if (greetSignal === undefined) return;
    if (firstSignal.current) {
      firstSignal.current = false;
      return;
    }
    requestGreeting();
  }, [greetSignal, requestGreeting]);

  // The canvas fades in over the poster, so there is never an empty circle.
  useEffect(() => {
    if (availability === "probing") return;
    const id = window.setTimeout(() => setCanvasReady(true), 60);
    return () => clearTimeout(id);
  }, [availability]);

  const interactive = Boolean(onSelect);
  const Wrapper = interactive ? "button" : "div";

  return (
    <Wrapper
      {...(interactive
        ? {
            type: "button" as const,
            onClick: onSelect,
            "aria-pressed": isSelected,
            "aria-label": label,
          }
        : { role: "img" as const, "aria-label": "Lily, your AI student" })}
      data-selected={isSelected || undefined}
      data-state={state}
      onPointerEnter={requestGreeting}
      onFocus={interactive ? requestGreeting : undefined}
      className={cn(
        "lily relative block size-32 shrink-0 rounded-full sm:size-36",
        interactive &&
          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      <span
        ref={hostRef as React.RefObject<HTMLSpanElement>}
        className={cn(
          "lily-circle relative block size-full overflow-hidden rounded-full border-2",
          "bg-[radial-gradient(circle_at_50%_32%,color-mix(in_oklab,var(--color-primary)_12%,var(--color-background))_0%,var(--color-muted)_100%)]",
          isSelected ? "border-primary" : "border-border",
        )}
      >
        {/* Poster: shown until WebGL has a frame up, and left in place if it
            never does. It is a fallback image, never the animated character. */}
        <Image
          src={POSTER_SRC}
          alt=""
          aria-hidden="true"
          width={368}
          height={490}
          priority={false}
          className={cn(
            "absolute bottom-0 left-1/2 h-[94%] w-auto -translate-x-1/2 object-contain transition-opacity duration-500",
            canvasReady ? "opacity-0" : "opacity-100",
          )}
        />

        {availability !== "probing" && (
          <LilyCanvas
            modelUrl={resolvedUrl}
            state={state}
            greetProgress={greetProgress}
            selectProgress={selectProgress}
            reducedMotion={reducedMotion}
            active={active}
            onModelError={() => setModelBroken(true)}
          />
        )}
      </span>

      {/* Selection is communicated by shape and text, not colour alone. */}
      {isSelected && (
        <span
          aria-hidden="true"
          className="lily-badge absolute right-0.5 top-0.5 z-10 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"
        >
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8.5 6.5 12 13 4.5" />
          </svg>
        </span>
      )}

      {/* Development-only signal that the generated GLB is not in place yet.
          Never shipped to users; see README.md for the model-generation step. */}
      {process.env.NODE_ENV !== "production" && usingStandIn && (
        <span
          title="Rendering the built-in 3D stand-in — drop the generated model at public/models/lily.glb to use it instead."
          className="pointer-events-none absolute -bottom-1 left-1/2 z-10 -translate-x-1/2 rounded-full border bg-background/90 px-1.5 py-px text-[9px] font-medium text-muted-foreground shadow-sm"
        >
          stand-in
        </span>
      )}
    </Wrapper>
  );
}
