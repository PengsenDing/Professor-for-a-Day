"use client";

import Image from "next/image";
import type { StudentArt } from "@/lib/student-art";
import type { StudentAvatarState } from "@/components/student-avatar";
import { cn } from "@/lib/utils";

/**
 * Session avatar for students with real portrait art: the chosen student
 * reacts to the conversation with the same lifecycle states as the SVG
 * `StudentAvatar`, expressed through the paper-doll rig (whole-figure poses
 * plus arm gestures) instead of facial changes — the portrait itself is
 * never warped. All motion lives in globals.css under the `.psa` scope,
 * keyed off `data-state`. Decorative only — pair it with a visible text
 * caption for screen readers.
 */
export function PortraitStudentAvatar({
  art,
  state,
  className,
}: {
  art: StudentArt;
  state: StudentAvatarState;
  className?: string;
}) {
  const { arm } = art;
  return (
    <div
      data-state={state}
      aria-hidden="true"
      className={cn(
        "psa relative flex select-none items-center justify-center",
        className,
      )}
    >
      {/* Thought bubble (thinking) */}
      <div className="psa-thought absolute right-0 top-1 z-10 flex items-center gap-1 rounded-full border bg-background px-2 py-1.5 shadow-sm">
        <span className="psa-dot1 size-1.5 rounded-full bg-muted-foreground" />
        <span className="psa-dot2 size-1.5 rounded-full bg-muted-foreground" />
        <span className="psa-dot3 size-1.5 rounded-full bg-muted-foreground" />
      </div>

      {/* Celebration sparkles (happy) */}
      <svg
        viewBox="0 0 24 24"
        className="psa-spark absolute left-[8%] top-[12%] size-[14%] fill-amber-500"
      >
        <path d="M12 2 l2.4 7.6 L22 12 l-7.6 2.4 L12 22 l-2.4 -7.6 L2 12 l7.6 -2.4 Z" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        className="psa-spark absolute right-[6%] top-[30%] size-[9%] fill-amber-500 [animation-delay:0.12s]"
      >
        <path d="M12 2 l2.4 7.6 L22 12 l-7.6 2.4 L12 22 l-2.4 -7.6 L2 12 l7.6 -2.4 Z" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        className="psa-spark absolute left-[16%] top-[42%] size-[6%] fill-amber-400 [animation-delay:0.24s]"
      >
        <circle cx="12" cy="12" r="10" />
      </svg>

      {/* Continuous float, then state poses on the inner wrapper */}
      <div className="psa-float flex h-full items-center justify-center">
        <div className="psa-pose relative inline-flex h-full items-center justify-center">
          {arm && (
            <Image
              src={arm.src}
              alt=""
              width={arm.naturalWidth}
              height={arm.naturalHeight}
              className="psa-arm absolute"
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
            src={art.image}
            alt=""
            width={368}
            height={490}
            className="relative z-[1] h-full w-auto object-contain drop-shadow-md"
          />
        </div>
      </div>
    </div>
  );
}
