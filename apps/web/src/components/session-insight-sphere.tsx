"use client";

import { useEffect, useRef, useState } from "react";
import { Brain, ListChecks } from "lucide-react";
import { MisconceptionCard } from "@/components/misconception-card";
import { RubricProgress } from "@/components/rubric-progress";
import type { ActiveMisconception, RubricPointRef } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * A small glass sphere floating under the composer that carries the session
 * evidence. Hovering (or keyboard-focusing) it previews the two section
 * titles — "Points you've demonstrated" and "Current misconception" — and
 * clicking opens the full cards in a panel above the sphere. The glass and
 * float visuals live under `.sis` in globals.css, sharing the language of
 * the start-teaching sphere and the knowledge-graph balls.
 */
export function SessionInsightSphere({
  points,
  misconception,
  studentName,
  className,
}: {
  points: RubricPointRef[];
  misconception: ActiveMisconception | null;
  studentName: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // The open panel dismisses like a popover: click anywhere outside or press
  // Escape (which also hands focus back to the sphere).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={cn("flex justify-center", className)}>
      <div
        ref={rootRef}
        data-open={open || undefined}
        className="sis group relative"
      >
        {/* Hover/focus preview: just the two section titles, as a teaser.
            Decorative — the button's aria-label carries the same summary. */}
        {!open && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-3 -translate-x-1/2"
          >
            <div
              className={cn(
                "w-max rounded-xl border bg-card px-3.5 py-2.5 text-card-foreground shadow-lg",
                "translate-y-1.5 scale-95 opacity-0 transition-all duration-300",
                "group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100",
                "group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100",
              )}
            >
              <p className="flex items-center gap-2 text-xs font-semibold">
                <ListChecks className="size-3.5 shrink-0 text-emerald-600" />
                Points you&apos;ve demonstrated
                <span className="ml-auto pl-3 font-normal tabular-nums text-muted-foreground">
                  {points.length}
                </span>
              </p>
              <p className="mt-1.5 flex items-center gap-2 text-xs font-semibold">
                <Brain className="size-3.5 shrink-0 text-amber-600" />
                Current misconception
                <span className="ml-auto pl-3 font-normal text-muted-foreground">
                  {misconception ? "open" : "none"}
                </span>
              </p>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                Click to see the details
              </p>
            </div>
          </div>
        )}

        {/* Click-open state: the rest of the UI blurs away behind a
            full-screen scrim, and the two cards float above it as one
            frameless, roomier sheet. Clicking the scrim closes it. */}
        {open && (
          <>
            <div
              aria-hidden="true"
              onPointerDown={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-background/50 backdrop-blur-md animate-in fade-in duration-300"
            />
            <div className="absolute bottom-full left-1/2 z-50 mb-4 -translate-x-1/2">
              <div
                role="dialog"
                aria-label="Points you've demonstrated and current misconception"
                className="max-h-[min(72vh,36rem)] w-[min(92vw,26rem)] overflow-y-auto rounded-3xl bg-card/70 text-card-foreground shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 slide-in-from-bottom-3 duration-300 sm:w-[30rem]"
              >
                <RubricProgress points={points} />
                <MisconceptionCard
                  misconception={misconception}
                  studentName={studentName}
                />
              </div>
            </div>
          </>
        )}

        {/* The idle float lives on a wrapper so it never fights the button's
            own hover/press transform (same trick as the start sphere). The
            sphere rises above the scrim while open, staying sharp as the
            panel's anchor. */}
        <span className={cn("sis-float block", open && "relative z-50")}>
          <button
            ref={buttonRef}
            type="button"
            aria-expanded={open}
            aria-label={`Session insights: ${points.length} ${
              points.length === 1 ? "point" : "points"
            } demonstrated${misconception ? ", one open misconception" : ""}`}
            onClick={() => setOpen((o) => !o)}
            className="sis-btn relative flex size-14 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:size-16"
          >
            {/* Glass shell (visuals in globals.css). */}
            <span
              aria-hidden="true"
              className="sis-shell absolute inset-0 rounded-full"
            />

            {/* Demonstrated-points count. */}
            <span
              aria-hidden="true"
              className={cn(
                "absolute -right-0.5 -top-0.5 z-10 flex size-5 items-center justify-center rounded-full text-[10px] font-bold tabular-nums ring-2 ring-background",
                points.length > 0
                  ? "bg-emerald-600 text-white"
                  : "border bg-muted text-muted-foreground",
              )}
            >
              {points.length}
            </span>

            {/* Amber pulse while a misconception is open. */}
            {misconception && (
              <span
                aria-hidden="true"
                className="absolute -bottom-0.5 -right-0.5 z-10 size-3 animate-pulse rounded-full bg-amber-500 ring-2 ring-background"
              />
            )}

            <span className="sis-label relative z-[1] text-foreground/80">
              <ListChecks className="size-5 sm:size-6" />
            </span>
          </button>
        </span>
      </div>
    </div>
  );
}
