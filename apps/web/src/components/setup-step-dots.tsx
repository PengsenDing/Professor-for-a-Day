"use client";

import { cn } from "@/lib/utils";

export interface SetupStep {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

/**
 * The setup flow's progress dots: pick a graph → pick a concept → pick a
 * student. Rendered identically on the graph picker and the per-graph wizard
 * so the three pages read as one continuous flow.
 */
export function SetupStepDots({
  steps,
  className,
}: {
  steps: SetupStep[];
  className?: string;
}) {
  return (
    <nav
      aria-label="Setup progress"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-4 z-10 flex justify-center",
        className,
      )}
    >
      <div className="pointer-events-auto flex items-center">
        {steps.map((step) => (
          <button
            key={step.label}
            type="button"
            disabled={step.disabled}
            aria-label={step.label}
            title={step.label}
            aria-current={step.active ? "step" : undefined}
            onClick={step.onClick}
            className={cn("group p-1.5", step.disabled && "cursor-not-allowed")}
          >
            <span
              className={cn(
                "block size-2 rounded-full transition-all duration-300",
                step.active ? "scale-125 bg-primary" : "bg-muted-foreground/40",
                !step.disabled && !step.active && "group-hover:bg-muted-foreground",
                step.disabled && "opacity-40",
              )}
            />
          </button>
        ))}
      </div>
    </nav>
  );
}
