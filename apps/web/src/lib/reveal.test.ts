import { describe, expect, it } from "vitest";
import {
  revealedWordCount,
  splitWords,
  startFallback,
  toAudioPhase,
} from "./reveal";

describe("splitWords", () => {
  it("keeps whitespace so joined prefixes reproduce the original text", () => {
    const text = "What is  gradient descent?\n\nAnd why does it work? ";
    const tokens = splitWords(text);
    expect(tokens.join("")).toBe(text);
    for (let i = 0; i <= tokens.length; i++) {
      expect(text.startsWith(tokens.slice(0, i).join(""))).toBe(true);
    }
  });

  it("attaches leading whitespace to the first word", () => {
    expect(splitWords("  hi there").join("")).toBe("  hi there");
  });

  it("returns no tokens for empty or whitespace-only text", () => {
    expect(splitWords("")).toEqual([]);
    expect(splitWords("   \n ")).toEqual([]);
  });
});

describe("revealedWordCount — fallback pacing", () => {
  const msPerWord = 170;

  it("shows the first word immediately", () => {
    const phase = startFallback(0, 1_000);
    expect(revealedWordCount(phase, 10, 1_000, msPerWord, null)).toBe(1);
  });

  it("reveals one more word per msPerWord of wall-clock time", () => {
    const phase = startFallback(0, 1_000);
    expect(revealedWordCount(phase, 10, 1_000 + msPerWord, msPerWord, null)).toBe(2);
    expect(revealedWordCount(phase, 10, 1_000 + 4 * msPerWord, msPerWord, null)).toBe(5);
  });

  it("clamps at the total word count", () => {
    const phase = startFallback(0, 1_000);
    expect(revealedWordCount(phase, 10, 1_000 + 60_000, msPerWord, null)).toBe(10);
  });

  it("catches up after a hidden-tab gap because it is clock-derived", () => {
    const phase = startFallback(0, 1_000);
    // No intermediate ticks happened; a single late read still lands right.
    expect(revealedWordCount(phase, 100, 1_000 + 10 * msPerWord, msPerWord, null)).toBe(11);
  });

  it("resumes from a mid-reveal index after detaching audio", () => {
    const phase = startFallback(7, 5_000);
    expect(revealedWordCount(phase, 20, 5_000, msPerWord, null)).toBe(8);
    expect(revealedWordCount(phase, 20, 5_000 + 2 * msPerWord, msPerWord, null)).toBe(10);
  });

  it("never goes backwards for a clock earlier than the start", () => {
    const phase = startFallback(3, 5_000);
    expect(revealedWordCount(phase, 20, 4_000, msPerWord, null)).toBe(4);
  });
});

describe("revealedWordCount — audio pacing", () => {
  it("spreads the remaining words evenly across the audio duration", () => {
    const phase = toAudioPhase(4); // 4 words already visible when audio started
    const total = 24;
    expect(revealedWordCount(phase, total, 0, 170, { currentTime: 0, duration: 10 })).toBe(4);
    expect(revealedWordCount(phase, total, 0, 170, { currentTime: 5, duration: 10 })).toBe(14);
    expect(revealedWordCount(phase, total, 0, 170, { currentTime: 10, duration: 10 })).toBe(24);
  });

  it("finishes exactly when the audio ends, even past the duration", () => {
    const phase = toAudioPhase(0);
    expect(revealedWordCount(phase, 8, 0, 170, { currentTime: 12, duration: 10 })).toBe(8);
  });

  it("holds position when the audio clock is unusable", () => {
    const phase = toAudioPhase(6);
    expect(revealedWordCount(phase, 20, 0, 170, null)).toBe(6);
    expect(revealedWordCount(phase, 20, 0, 170, { currentTime: 0, duration: 0 })).toBe(6);
  });

  it("clamps a negative or rewound clock to the attach index", () => {
    const phase = toAudioPhase(6);
    expect(revealedWordCount(phase, 20, 0, 170, { currentTime: -1, duration: 10 })).toBe(6);
  });
});
