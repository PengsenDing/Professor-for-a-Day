"use client";

import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A glass sphere action button for the row under the composer — the Speak
 * and Send actions rendered in the same visual language as the session
 * insight sphere: identical glass shell, idle float, hover/press transforms.
 * The visuals live under `.csp` in globals.css.
 */
export function ComposerSphere({
  icon,
  active = false,
  danger = false,
  float,
  className,
  ...buttonProps
}: {
  /** Icon rendered inside the sphere. */
  icon: ReactNode;
  /** Keeps the shell lit without hover (e.g. while recording). */
  active?: boolean;
  /** Lights the shell with the destructive colour instead of the ring. */
  danger?: boolean;
  /** Stagger the idle float so adjacent spheres never bob in unison. */
  float?: { duration: string; delay: string };
  className?: string;
} & Omit<ComponentProps<"button">, "className" | "children">) {
  const floatStyle: CSSProperties | undefined = float && {
    animationDuration: float.duration,
    animationDelay: float.delay,
  };

  return (
    <div
      data-active={active || undefined}
      className={cn("csp", danger && "csp-danger", className)}
    >
      {/* The idle float lives on a wrapper so it never fights the button's
          own hover/press transform (same trick as the other spheres). */}
      <span className="csp-float block" style={floatStyle}>
        <button
          type="button"
          className="csp-btn relative flex size-14 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:size-16"
          {...buttonProps}
        >
          {/* Glass shell (visuals in globals.css). */}
          <span
            aria-hidden="true"
            className="csp-shell absolute inset-0 rounded-full"
          />
          <span className="csp-label relative z-[1] text-foreground/80">
            {icon}
          </span>
        </button>
      </span>
    </div>
  );
}
