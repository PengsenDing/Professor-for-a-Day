"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  CHARACTERS,
  type CharacterId,
  type CharacterState,
  type CharacterVideoTrack,
} from "@/lib/characters";
import { cn } from "@/lib/utils";

const TRACKS: readonly CharacterVideoTrack[] = [
  "idle",
  "greeting",
  "speaking",
  "listening",
];

/** Keep in sync with the `duration-300` crossfade class on the videos. */
const CROSSFADE_MS = 300;

/** Which encoding a track is currently trying, or "failed" when both are out. */
type TrackSource = "webm" | "mp4" | "failed";

export interface CharacterVideoAvatarProps {
  characterId: CharacterId;
  /**
   * App-driven state. "speaking"/"listening" select those loops, "selected"
   * shows the selection ring over the idle loop, "greeting" plays the
   * one-shot greeting. Hover/focus greetings are handled internally.
   */
  state?: CharacterState;
  /** Convenience booleans mirroring the app's audio state; "speaking" wins. */
  isListening?: boolean;
  isSpeaking?: boolean;
  /** True when this character is the chosen student. */
  selected?: boolean;
  /** Provided => the avatar becomes a real button. Omit for display-only use. */
  onSelect?: (characterId: CharacterId) => void;
  /** Change this value to trigger a greeting from outside (e.g. card hover). */
  greetSignal?: number | string;
  /** Accessible name of the control. */
  label?: string;
  /**
   * Text in the greeting speech bubble; the clips themselves are silent.
   * Defaults to the character's own line from lib/characters.ts.
   */
  greetingText?: string;
  /**
   * Set false to suppress the manga speech bubble entirely; greetings then
   * play the clip only (used in the session view, where the student already
   * speaks through the conversation).
   */
  showBubble?: boolean;
  className?: string;
}

/**
 * A student character rendered from pre-rendered, muted video clips — one per
 * animation state (idle / greeting / speaking / listening), configured in
 * lib/characters.ts.
 *
 * State machine (mirrors the app, never the other way around):
 *   idle loop by default → pointer/focus/greetSignal plays the one-shot
 *   greeting and falls back to idle → `isListening` loops the listening clip
 *   while the learner talks → `isSpeaking` loops the speaking clip while AI
 *   audio plays and outranks listening → both false returns to idle.
 *
 * Transitions crossfade: the outgoing clip stays frozen on its last visible
 * frame underneath while the incoming clip fades in only after it is actually
 * playing, so there is never a blank frame. A resting-pose poster sits at the
 * bottom of the stack as the loading and error fallback. Every clip is muted;
 * the AI voice plays through the existing speech pipeline, never the videos.
 */
export function CharacterVideoAvatar({
  characterId,
  state = "idle",
  isListening = false,
  isSpeaking = false,
  selected = false,
  onSelect,
  greetSignal,
  label,
  greetingText,
  showBubble = true,
  className,
}: CharacterVideoAvatarProps) {
  const config = CHARACTERS[characterId];
  const bubbleText = greetingText ?? config.greeting;
  const isSelected = selected || state === "selected";

  // App-driven track: speaking outranks listening (spec: listening → speaking
  // the moment the AI answers); both outrank the greeting pleasantry.
  const speaking = isSpeaking || state === "speaking";
  const listening = !speaking && (isListening || state === "listening");
  const baseTrack: CharacterVideoTrack = speaking
    ? "speaking"
    : listening
      ? "listening"
      : "idle";

  const [greetingActive, setGreetingActive] = useState(false);

  function requestGreeting() {
    // A greeting only makes sense from rest.
    if (baseTrack === "idle") setGreetingActive(true);
  }

  // Prop-driven greeting requests and cancellations use React's
  // adjust-state-during-render pattern (not effects): state="greeting" or a
  // greetSignal bump asks for the one-shot, and a real conversation state
  // taking over cancels any pending greeting outright.
  const [prevPropState, setPrevPropState] = useState(state);
  if (state !== prevPropState) {
    setPrevPropState(state);
    if (state === "greeting") setGreetingActive(true);
  }
  const [prevSignal, setPrevSignal] = useState(greetSignal);
  if (greetSignal !== prevSignal) {
    setPrevSignal(greetSignal);
    if (baseTrack === "idle") setGreetingActive(true);
  }
  const [prevBase, setPrevBase] = useState(baseTrack);
  if (baseTrack !== prevBase) {
    setPrevBase(baseTrack);
    if (baseTrack !== "idle" && greetingActive) setGreetingActive(false);
  }

  const desired: CharacterVideoTrack =
    baseTrack !== "idle" ? baseTrack : greetingActive ? "greeting" : "idle";

  // --- video track switching -----------------------------------------------
  const videoRefs = useRef<
    Partial<Record<CharacterVideoTrack, HTMLVideoElement | null>>
  >({});
  const [active, setActive] = useState<CharacterVideoTrack>("idle");
  const [previous, setPrevious] = useState<CharacterVideoTrack | null>(null);
  // Every track starts on WebM; onError walks a track down to the MP4
  // fallback (covers browsers without VP9) and finally to "failed", where the
  // poster takes over. No up-front capability probe is needed.
  const [sources, setSources] = useState<
    Record<CharacterVideoTrack, TrackSource>
  >({ idle: "webm", greeting: "webm", speaking: "webm", listening: "webm" });

  // Swap to the desired track only once it is actually playing; until then the
  // current track keeps running, so a still-buffering clip never blanks the
  // avatar. If the clip is unavailable, swap anyway — the poster shows.
  useEffect(() => {
    if (desired === active) return;
    let cancelled = false;
    const show = () => {
      if (cancelled) return;
      setPrevious(active);
      setActive(desired);
    };
    const el = videoRefs.current[desired];
    if (el && sources[desired] !== "failed") {
      try {
        el.currentTime = 0;
      } catch {
        // not seekable yet — it will simply start from the beginning
      }
      // play() can hang (not just reject) under strict background-media
      // policies; the swap must still land so the avatar mirrors the app
      // state — worst case the incoming clip sits on its poster frame.
      const playing = el.play().catch(() => {});
      const timeout = new Promise<void>((r) => {
        window.setTimeout(r, 1000);
      });
      Promise.race([playing, timeout]).then(show);
    } else {
      // No playable clip for this state: swap on the microtask queue.
      Promise.resolve().then(show);
    }
    return () => {
      cancelled = true;
    };
  }, [desired, active, sources]);

  // Kick the initial idle loop explicitly: some environments ignore the
  // autoplay attribute even for muted video. If playback is still refused
  // (strict autoplay policies), the poster stays up and the first user
  // interaction starts the clips — the avatar never goes blank.
  useEffect(() => {
    const el = videoRefs.current[active];
    if (el && sources[active] !== "failed") el.play().catch(() => {});
    // Mount-only: later switches play their track in the swap effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resume the visible track when the tab becomes visible again — mobile
  // browsers can pause muted loops in the background and not resume them.
  useEffect(() => {
    const resume = () => {
      if (document.visibilityState !== "visible") return;
      const el = videoRefs.current[active];
      if (el && sources[active] !== "failed") el.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", resume);
    return () => document.removeEventListener("visibilitychange", resume);
  }, [active, sources]);

  // After the crossfade lands, pause everything except the visible track.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      for (const track of TRACKS) {
        if (track !== active) videoRefs.current[track]?.pause();
      }
      setPrevious(null);
    }, CROSSFADE_MS + 50);
    return () => clearTimeout(timer);
  }, [active]);

  // A source swap (webm → mp4) reloads the element; resume it if it is the
  // track currently on screen.
  useEffect(() => {
    const el = videoRefs.current[active];
    if (el && sources[active] !== "failed") el.play().catch(() => {});
  }, [sources, active]);

  function handleVideoError(track: CharacterVideoTrack) {
    setSources((prev) => ({
      ...prev,
      [track]: prev[track] === "webm" ? "mp4" : "failed",
    }));
  }

  const interactive = Boolean(onSelect);
  const Wrapper = interactive ? "button" : "div";

  return (
    <Wrapper
      {...(interactive
        ? {
            type: "button" as const,
            onClick: () => onSelect?.(characterId),
            "aria-pressed": isSelected,
            "aria-label": label ?? `Select ${config.name} as your student`,
          }
        : {
            role: "img" as const,
            "aria-label": label ?? `${config.name}, your AI student`,
          })}
      data-selected={isSelected || undefined}
      data-greeting={greetingActive || undefined}
      onPointerEnter={requestGreeting}
      onFocus={interactive ? requestGreeting : undefined}
      className={cn(
        "cva relative block size-32 shrink-0 rounded-full sm:size-36",
        interactive &&
          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      {/* Greeting bubble (decorative; the wrapper label carries meaning).
          Styled as a manga dialogue box — outline, tail and 3D pop live in
          the .cva-bubble rules in globals.css. */}
      {showBubble && (
        <span
          aria-hidden="true"
          className="cva-bubble absolute -top-7 left-1/2 z-10 w-max max-w-56 px-3 py-1 text-center text-xs font-bold leading-snug text-foreground"
        >
          {bubbleText}
        </span>
      )}

      {/* Keyed by character so a character swap remounts the video stack and
          autoplay/preload start clean for the new clip set. */}
      <span
        key={characterId}
        className={cn(
          "cva-circle relative block size-full overflow-hidden rounded-full border-2",
          "bg-[radial-gradient(circle_at_50%_35%,var(--color-muted)_0%,var(--color-background)_78%)]",
          isSelected ? "border-primary" : "border-border",
        )}
      >
        {/* Resting-pose poster: paints before the first video frame and stays
            as the fallback if every clip for a state fails to load. */}
        <Image
          src={config.poster}
          alt=""
          aria-hidden="true"
          width={720}
          height={720}
          className="absolute inset-0 size-full object-cover"
          draggable={false}
        />

        {TRACKS.map((track) => {
          const source = sources[track];
          if (source === "failed") return null;
          return (
            <video
              key={track}
              ref={(el) => {
                videoRefs.current[track] = el;
                // React does not always reflect `muted` onto the DOM node;
                // enforce it so no state clip can ever produce sound.
                if (el) el.muted = true;
              }}
              src={config.videos[track][source]}
              muted
              playsInline
              preload="auto"
              loop={track !== "greeting"}
              autoPlay={track === "idle"}
              poster={track === "idle" ? config.poster : undefined}
              disablePictureInPicture
              aria-hidden="true"
              tabIndex={-1}
              onEnded={
                track === "greeting"
                  ? () => setGreetingActive(false)
                  : undefined
              }
              onError={() => handleVideoError(track)}
              className={cn(
                "pointer-events-none absolute inset-0 size-full object-cover",
                "transition-opacity duration-300 motion-reduce:transition-none",
                active === track
                  ? "z-[2] opacity-100"
                  : previous === track
                    ? "z-[1] opacity-100"
                    : "opacity-0",
              )}
            />
          );
        })}
      </span>

      {/* Selection is communicated by the bold ring and glow (plus
          aria-pressed for assistive technology) — no badge. */}
    </Wrapper>
  );
}
