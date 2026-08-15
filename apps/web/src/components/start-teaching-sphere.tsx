"use client";

import { useState } from "react";
import { Loader2, Play } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Deterministic spark fan for the click burst. Angles sweep the full circle
 * with a little per-index jitter so the burst reads organic without needing
 * randomness (which would differ between server and client renders).
 */
const SPARKS = Array.from({ length: 12 }, (_, i) => ({
  angle: i * 30 + (i % 3) * 8,
  distance: 64 + (i % 4) * 11,
  delay: (i % 4) * 40,
}));

/**
 * The step-2 call to action: a transparent glass sphere echoing the
 * knowledge-graph balls. Neutral glass at rest, green glow on hover/focus,
 * a ring-and-spark burst on click, and a rising green "water" fill while the
 * session request is in flight — the same water-as-progress motif the graph
 * uses for mastery. All visuals live under `.sts` in globals.css.
 */
export function StartTeachingSphere({
  pending,
  disabled,
  onStart,
  className,
}: {
  /** True while the session is being created; plays the fill animation. */
  pending: boolean;
  disabled: boolean;
  onStart: () => void;
  className?: string;
}) {
  // Keyed burst layer: bumping the key remounts it so the one-shot replays.
  const [burst, setBurst] = useState(0);

  function handleClick() {
    if (disabled || pending) return;
    setBurst((n) => n + 1);
    onStart();
  }

  return (
    <div className={cn("sts flex justify-center", className)}>
      {/* The idle float lives on a wrapper so it never fights the button's
          own hover/press transform. */}
      <span className="sts-float inline-block">
        <button
          type="button"
          aria-label="Start teaching"
          disabled={disabled || pending}
          data-pending={pending || undefined}
          onClick={handleClick}
          className="sts-btn relative flex size-28 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:size-32"
        >
          {/* Click burst (decorative): expanding rings + a fan of sparks. */}
          {burst > 0 && (
            <span
              key={burst}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
            >
              <span className="sts-ring absolute inset-0 rounded-full" />
              <span className="sts-ring sts-ring2 absolute inset-0 rounded-full" />
              {SPARKS.map((spark, i) => (
                <span
                  key={i}
                  className="sts-spark absolute left-1/2 top-1/2 size-1.5 rounded-full"
                  style={
                    {
                      "--sts-a": `${spark.angle}deg`,
                      "--sts-d": `${spark.distance}px`,
                      animationDelay: `${spark.delay}ms`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </span>
          )}

          {/* Glass shell; clips the water fill to the sphere. */}
          <span
            aria-hidden="true"
            className="sts-shell absolute inset-0 overflow-hidden rounded-full"
          >
            <span className="sts-water absolute inset-0" />
          </span>

          {/* Icon only — the button carries its name via aria-label. A filled
              triangle reads bolder than the stroked default. */}
          <span className="sts-label relative z-10 flex items-center justify-center">
            {pending ? (
              <Loader2 className="size-8 animate-spin" strokeWidth={2.5} />
            ) : (
              <Play className="size-9" strokeWidth={2.5} fill="currentColor" />
            )}
          </span>
        </button>
      </span>
    </div>
  );
}
