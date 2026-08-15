import type { Mode } from "@/lib/types";

/**
 * Pre-rendered video characters (Lily, Max, Sokrates).
 *
 * Each character is represented by four short, muted clips under
 * /public/characters/<id>/ — one per animation state. The clips carry no
 * audio by design: the AI voice plays through the existing speech pipeline
 * (lib/api getTurnSpeech) while the matching clip loops, so visuals and
 * audio stay independent. Idle/speaking/listening are seamless loops
 * (first ≈ last frame); greeting is a one-shot that returns to the resting
 * pose. Replacing a character with better renders is a pure asset swap —
 * keep the same paths and the four-state contract.
 */

export type CharacterId = "lily" | "max" | "sokrates";

/** Interaction states a character can express (see CharacterVideoAvatar). */
export type CharacterState =
  "idle" | "greeting" | "speaking" | "listening" | "selected";

/** The four video tracks; "selected" reuses the idle track plus a ring. */
export type CharacterVideoTrack = Exclude<CharacterState, "selected">;

export interface CharacterVideoSource {
  /** Preferred encoding (VP9). */
  webm: string;
  /** Broad-compatibility fallback (H.264). */
  mp4: string;
}

export interface CharacterConfig {
  id: CharacterId;
  name: string;
  /** Resting-pose still: <video poster>, loading state, and error fallback. */
  poster: string;
  /** In-character speech-bubble line for the hover greeting. */
  greeting: string;
  videos: Record<CharacterVideoTrack, CharacterVideoSource>;
}

function characterVideos(id: CharacterId): CharacterConfig["videos"] {
  const base = `/characters/${id}/${id}`;
  return {
    idle: { webm: `${base}-idle.webm`, mp4: `${base}-idle.mp4` },
    greeting: { webm: `${base}-greeting.webm`, mp4: `${base}-greeting.mp4` },
    speaking: { webm: `${base}-speaking.webm`, mp4: `${base}-speaking.mp4` },
    listening: { webm: `${base}-listening.webm`, mp4: `${base}-listening.mp4` },
  };
}

export const CHARACTERS: Record<CharacterId, CharacterConfig> = {
  lily: {
    id: "lily",
    name: "Lily",
    poster: "/characters/lily/lily-poster.jpg",
    greeting: "Hi! What are we learning today?",
    videos: characterVideos("lily"),
  },
  max: {
    id: "max",
    name: "Max",
    poster: "/characters/max/max-poster.jpg",
    greeting: "Oh, I basically know this already!",
    videos: characterVideos("max"),
  },
  sokrates: {
    id: "sokrates",
    name: "Sokrates",
    poster: "/characters/sokrates/sokrates-poster.jpg",
    greeting: "Hmm… convince me.",
    videos: characterVideos("sokrates"),
  },
};

/** The video character for each AI Student mode (all three modes have one). */
export const CHARACTER_BY_MODE: Record<Mode, CharacterId> = {
  beginner: "lily",
  confident: "max",
  skeptic: "sokrates",
};
