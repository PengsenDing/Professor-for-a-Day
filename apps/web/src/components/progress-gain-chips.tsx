"use client";

import { useEffect, useRef } from "react";
import { Brain, CheckCircle2 } from "lucide-react";
import type { GainChip } from "@/lib/progress-gain";
import { cn } from "@/lib/utils";

/**
 * The Judge's confirmations, surfaced: each newly confirmed rubric point (and
 * a cleared misconception) pops in as a chip under the header, dwells long
 * enough to read, then flies into the header progress bar and merges — the
 * bar's own width transition plays the increase as the chip lands. Purely
 * presentational: the page owns the queue and advances the displayed percent
 * from `onConsumed`. Reduced motion swaps the flight for a longer static
 * dwell (the aria-live region announces either way).
 */

const DWELL_MS = 1500;
const REDUCED_MOTION_DWELL_MS = 2600;
const FLIGHT_MS = 500;

export function ProgressGainChips({
  queue,
  getTarget,
  reducedMotion,
  onConsumed,
}: {
  /** Pending chips, oldest first; only the head is on screen at a time. */
  queue: GainChip[];
  /** Resolves the progress bar actually on screen (header on sm+, inline below). */
  getTarget: () => HTMLElement | null;
  reducedMotion: boolean;
  /** The head chip finished (flight landed, or dwell elapsed): dequeue and bump the bar. */
  onConsumed: (chip: GainChip) => void;
}) {
  const chip = queue[0] ?? null;
  const chipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chip) return;
    let flight: Animation | null = null;
    let landed = false;
    const dwell = window.setTimeout(() => {
      const el = chipRef.current;
      const target = getTarget();
      if (reducedMotion || !el || !target) {
        landed = true;
        onConsumed(chip);
        return;
      }
      const from = el.getBoundingClientRect();
      const to = target.getBoundingClientRect();
      // Aim at the bar's right end so the chip reads as absorbed into the
      // fill; ease-in so it accelerates toward it.
      flight = el.animate(
        [
          { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
          {
            transform: `translate(${to.right - from.right}px, ${
              to.top + to.height / 2 - (from.top + from.height / 2)
            }px) scale(0.15)`,
            opacity: 0.35,
          },
        ],
        { duration: FLIGHT_MS, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" },
      );
      flight.onfinish = () => {
        landed = true;
        onConsumed(chip);
      };
    }, reducedMotion ? REDUCED_MOTION_DWELL_MS : DWELL_MS);
    return () => {
      window.clearTimeout(dwell);
      if (!landed) flight?.cancel();
    };
  }, [chip, getTarget, reducedMotion, onConsumed]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-4"
    >
      {chip && (
        <div
          key={chip.key}
          ref={chipRef}
          className={cn(
            "animate-in fade-in zoom-in-95 slide-in-from-top-2 flex max-w-full items-center gap-2 rounded-full border px-4 py-2 text-sm shadow-lg backdrop-blur-sm duration-300",
            chip.kind === "point"
              ? "border-emerald-500/40 bg-emerald-50/95 text-emerald-900 dark:bg-emerald-950/90 dark:text-emerald-100"
              : "border-amber-500/40 bg-amber-50/95 text-amber-900 dark:bg-amber-950/90 dark:text-amber-100",
          )}
        >
          {chip.kind === "point" ? (
            <>
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
              <span className="sr-only">Point confirmed:</span>
              <span className="truncate font-medium">{chip.label}</span>
            </>
          ) : (
            <>
              <Brain className="size-4 shrink-0 text-amber-600" />
              <span className="shrink-0 font-medium">Misconception cleared</span>
              <span className="truncate opacity-80">— {chip.label}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
