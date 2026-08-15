"use client";

import Image from "next/image";
import { Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

import type { WavingArm } from "@/lib/student-art";

/**
 * Selectable student avatar for the setup flow ("Pick your student").
 * Distinct from `StudentAvatar` (the in-session reactive SVG): this one is a
 * real button showing a character portrait inside a circular container, with
 * idle / hover / selected motion. All animation lives in globals.css under
 * the `.spa` scope, keyed off :hover, :focus-visible and data-selected, so
 * reduced-motion handling stays in one place.
 *
 * The portrait (`imageSrc`) is a transparent full-body render; students
 * without one yet fall back to their mode icon, so Max and Sokrates can
 * adopt portraits later without touching this component. When `arm` is given
 * the portrait must be the body-only render (arm removed) and the sprite
 * waves on hover; without it the whole figure does a gentle greeting rock.
 */
export function StudentPickerAvatar({
  studentId,
  name,
  label,
  description,
  imageSrc,
  arm,
  icon: Icon,
  selected,
  onSelect,
  greeting = "Hallo!",
  className,
}: {
  /** Stable id passed to onSelect, e.g. "lily". */
  studentId: string;
  name: string;
  /** Short mode label shown next to the name, e.g. "Beginner". */
  label?: string;
  description?: string;
  /** Transparent portrait under /public. Falls back to `icon` when absent. */
  imageSrc?: string;
  /** Optional waving-arm layer; requires `imageSrc` to be the body render. */
  arm?: WavingArm;
  icon?: LucideIcon;
  selected: boolean;
  onSelect: (studentId: string) => void;
  /** Text in the hover speech bubble. */
  greeting?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(studentId)}
      aria-pressed={selected}
      aria-label={`Select ${name} as your student`}
      data-selected={selected || undefined}
      className={cn(
        "spa group flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected ? "border-primary bg-primary/5" : "hover:bg-muted/40",
        className,
      )}
    >
      <span className="relative">
        {/* Greeting bubble (decorative; the button label carries meaning) */}
        <span
          aria-hidden="true"
          className="spa-bubble absolute -top-3 left-1/2 z-10 rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium text-foreground shadow-md"
        >
          {greeting}
        </span>

        <span
          className={cn(
            "spa-circle relative flex size-32 items-center justify-center overflow-hidden rounded-full border-2 sm:size-36",
            "bg-[radial-gradient(circle_at_50%_35%,var(--color-muted)_0%,var(--color-background)_78%)]",
            selected ? "border-primary" : "border-border",
          )}
        >
          {imageSrc ? (
            <span
              data-layered={arm ? "" : undefined}
              className="spa-figure relative mt-2 inline-flex h-[94%] items-center justify-center"
            >
              {arm && (
                <Image
                  src={arm.src}
                  alt=""
                  width={arm.naturalWidth}
                  height={arm.naturalHeight}
                  className="spa-arm absolute"
                  style={{
                    left: arm.left,
                    top: arm.top,
                    width: arm.width,
                    height: "auto",
                    transformOrigin: arm.origin,
                  }}
                />
              )}
              <Image
                src={imageSrc}
                alt=""
                width={368}
                height={490}
                className="relative z-[1] h-full w-auto object-contain drop-shadow-md"
              />
            </span>
          ) : Icon ? (
            <Icon className="spa-figure size-12 text-muted-foreground" />
          ) : null}
        </span>

        {/* Selection badge: a non-color indicator on top of the ring */}
        {selected && (
          <span className="spa-badge absolute right-1 top-1 z-10 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
            <Check className="size-3.5" aria-hidden="true" />
          </span>
        )}
      </span>

      <span className="mt-1 leading-tight">
        <span className="font-medium">{name}</span>
        {label && (
          <span className="text-xs font-normal text-muted-foreground">
            {" "}
            · {label}
          </span>
        )}
      </span>
      {description && (
        <span className="text-xs text-muted-foreground">{description}</span>
      )}
    </button>
  );
}
