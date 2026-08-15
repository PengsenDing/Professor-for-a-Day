// Word-by-word reveal pacing for AI Student replies and voice transcripts.
// "Streaming" here is purely visual: the contract still delivers one atomic
// JSON turn and one complete MP3 per turn (ADR 0003). Visible word counts are
// derived from a clock (audio position, or wall clock in fallback), never
// accumulated per tick, so hidden-tab throttling and audio stalls self-correct.

/** Fallback pace for AI Student text when no audio is driving the reveal. */
export const STUDENT_FALLBACK_MS_PER_WORD = 170;
/** Pace for the learner's own voice transcript (their words, faster). */
export const LEARNER_TRANSCRIPT_MS_PER_WORD = 100;

export interface AudioClock {
  /** Playback position in seconds. */
  currentTime: number;
  /** Total duration in seconds. */
  duration: number;
}

export type RevealPhase =
  | { kind: "fallback"; startIndex: number; startedAtMs: number }
  | { kind: "audio"; startIndex: number };

/**
 * Splits text into word tokens that keep their surrounding whitespace, so
 * `tokens.slice(0, n).join("")` is always an exact prefix of the original.
 */
export function splitWords(text: string): string[] {
  return text.match(/\s*\S+\s*/g) ?? [];
}

export function startFallback(startIndex: number, nowMs: number): RevealPhase {
  return { kind: "fallback", startIndex, startedAtMs: nowMs };
}

export function toAudioPhase(startIndex: number): RevealPhase {
  return { kind: "audio", startIndex };
}

/**
 * How many words are visible right now.
 *
 * Fallback: the word at startIndex shows immediately, then one more every
 * msPerWord of wall-clock time. Audio: the words remaining at attach time are
 * spread evenly across the audio's duration, so text and voice finish
 * together; with no usable clock the reveal holds at startIndex (the caller
 * detaches back to fallback on mute/error).
 */
export function revealedWordCount(
  phase: RevealPhase,
  totalWords: number,
  nowMs: number,
  msPerWord: number,
  audio: AudioClock | null,
): number {
  if (phase.kind === "audio") {
    if (!audio || !(audio.duration > 0)) {
      return Math.min(phase.startIndex, totalWords);
    }
    const fraction = Math.min(Math.max(audio.currentTime / audio.duration, 0), 1);
    return Math.min(
      totalWords,
      phase.startIndex + Math.floor(fraction * (totalWords - phase.startIndex)),
    );
  }
  const elapsed = Math.max(0, nowMs - phase.startedAtMs);
  return Math.min(
    totalWords,
    phase.startIndex + 1 + Math.floor(elapsed / msPerWord),
  );
}
