"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * The Teacher Report's score as a knowledge-graph ball: a floating glass
 * sphere whose water level is the session's final percent (the graph's
 * Mastery motif — visuals under `.rss` in globals.css), drifting above a
 * soft ground shadow. At 100% the ball glows green.
 *
 * Decorative: the percentage is rendered as text next to it by the caller.
 */
export function ReportScoreSphere({
  percent,
  className,
}: {
  percent: number;
  className?: string;
}) {
  const level = Math.min(100, Math.max(0, percent));
  return (
    <div aria-hidden="true" className={cn("relative pb-4", className)}>
      <span className="rss-float block">
        <div
          data-mastery={level === 100 || undefined}
          className="rss relative size-36 sm:size-40"
          style={{ "--rss-level": `${100 - level}%` } as CSSProperties}
        >
          {/* Water first, clipped to the ball; the glass shell renders above
              it so the specular highlight reads as glazing over the water.
              At 0% there is no water at all — otherwise its crest line would
              peek over the ball's bottom edge. */}
          {level > 0 && (
            <span className="absolute inset-0 overflow-hidden rounded-full">
              <span className="rss-water absolute inset-0" />
            </span>
          )}
          <span className="rss-shell absolute inset-0 rounded-full" />
        </div>
      </span>
      <span className="rss-ground absolute bottom-0 left-1/2 w-3/4" />
    </div>
  );
}
