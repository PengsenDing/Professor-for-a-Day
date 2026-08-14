import type { CSSProperties } from "react";
import type { Mode } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Conversation-lifecycle states the avatar can express.
 * All animation lives in globals.css under the `.sa` scope, keyed off
 * `data-state`, so states can be extended or restyled without touching JSX.
 */
export type StudentAvatarState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "happy"
  | "confused";

const SHIRT_COLORS: Record<Mode, { shirt: string; sleeve: string }> = {
  beginner: { shirt: "#34d399", sleeve: "#0d9488" },
  confident: { shirt: "#fbbf24", sleeve: "#d97706" },
  skeptic: { shirt: "#a78bfa", sleeve: "#7c3aed" },
};

/**
 * A cartoon student that visually reacts to the conversation: leaning in and
 * nodding while you type, pondering with a thought bubble while the backend
 * works, talking with gestures while a reply is presented, celebrating at
 * mastery, and looking puzzled on errors. Decorative only — pair it with a
 * visible text caption for screen readers.
 */
export function StudentAvatar({
  state,
  mode,
  className,
}: {
  state: StudentAvatarState;
  mode: Mode;
  className?: string;
}) {
  const colors = SHIRT_COLORS[mode];
  return (
    <svg
      viewBox="0 0 200 200"
      data-state={state}
      className={cn("sa select-none", className)}
      style={
        {
          "--sa-shirt": colors.shirt,
          "--sa-sleeve": colors.sleeve,
          "--sa-skin": "#fcd0a8",
          "--sa-line": "#273042",
        } as CSSProperties
      }
      aria-hidden="true"
      focusable="false"
    >
      <g className="sa-root">
        <ellipse cx="100" cy="174" rx="36" ry="6" fill="#000" opacity=".08" />
        <g className="sa-lean">
          {/* Thought bubble (thinking) */}
          <g className="sa-thought">
            <circle cx="136" cy="54" r="3" className="fill-muted-foreground/40" />
            <circle cx="144" cy="44" r="4.5" className="fill-muted-foreground/30" />
            <rect
              x="148"
              y="16"
              width="46"
              height="26"
              rx="13"
              className="fill-background stroke-border"
              strokeWidth="1.5"
            />
            <circle cx="163" cy="29" r="2.5" className="sa-dot1 fill-muted-foreground" />
            <circle cx="171" cy="29" r="2.5" className="sa-dot2 fill-muted-foreground" />
            <circle cx="179" cy="29" r="2.5" className="sa-dot3 fill-muted-foreground" />
          </g>

          {/* Celebration sparkles (happy) */}
          <g className="sa-sparks" fill="#f59e0b">
            <path d="M52 44 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 z" />
            <path d="M152 60 l2.4 5.6 5.6 2.4 -5.6 2.4 -2.4 5.6 -2.4 -5.6 -5.6 -2.4 5.6 -2.4 z" />
            <circle cx="60" cy="72" r="2.5" />
          </g>

          {/* Torso */}
          <path
            d="M68 134 q0 -22 32 -22 q32 0 32 22 v24 q0 8 -8 8 h-48 q-8 0 -8 -8 z"
            fill="var(--sa-shirt)"
          />
          {/* Left arm (resting) */}
          <path
            d="M74 128 Q60 140 64 154"
            stroke="var(--sa-sleeve)"
            strokeWidth="9"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="64" cy="156" r="5" fill="var(--sa-skin)" />
          {/* Right arm (gestures while speaking) */}
          <g className="sa-arm">
            <path
              d="M126 128 Q140 140 136 154"
              stroke="var(--sa-sleeve)"
              strokeWidth="9"
              fill="none"
              strokeLinecap="round"
            />
            <circle cx="136" cy="156" r="5" fill="var(--sa-skin)" />
          </g>

          {/* Head */}
          <g className="sa-head">
            <circle cx="100" cy="76" r="38" fill="var(--sa-skin)" />
            <path
              d="M64 70 Q66 44 100 42 Q134 44 136 70 Q118 56 100 56 Q82 56 64 70 Z"
              fill="#4b3826"
            />
            {/* Graduation cap */}
            <path d="M100 24 L136 39 L100 54 L64 39 Z" fill="#111827" />
            <path
              d="M84 45 q16 8 32 0 v9 q-16 8 -32 0 z"
              fill="#1f2937"
            />
            <path
              d="M136 39 q4 10 3 19"
              stroke="#f59e0b"
              strokeWidth="2"
              fill="none"
            />
            <circle cx="139" cy="60" r="2.5" fill="#f59e0b" />
            {/* Brows */}
            <path
              className="sa-brow-l"
              d="M79 62 q6 -3.5 13 -.5"
              stroke="var(--sa-line)"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            />
            <path
              className="sa-brow-r"
              d="M108 61.5 q7 -3 13 .5"
              stroke="var(--sa-line)"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            />
            {/* Eyes */}
            <g className="sa-eyes">
              <ellipse cx="87" cy="74" rx="6" ry="6.5" fill="#fff" />
              <ellipse cx="113" cy="74" rx="6" ry="6.5" fill="#fff" />
              <g className="sa-pupils">
                <circle cx="87.5" cy="75" r="2.8" fill="var(--sa-line)" />
                <circle cx="113.5" cy="75" r="2.8" fill="var(--sa-line)" />
              </g>
            </g>
            {/* Blush */}
            <circle cx="76" cy="87" r="4.5" fill="#fb7185" opacity=".22" />
            <circle cx="124" cy="87" r="4.5" fill="#fb7185" opacity=".22" />
            {/* Mouths — one per state, cross-faded via CSS */}
            <g className="sa-mouth">
              <path
                className="sa-mouth-smile"
                d="M92 92 Q100 99 108 92"
                stroke="var(--sa-line)"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
              />
              <path
                className="sa-mouth-grin"
                d="M89 90 Q100 104 111 90 Q100 95 89 90 Z"
                fill="#8b3a48"
              />
              <ellipse
                className="sa-mouth-open"
                cx="100"
                cy="95"
                rx="6"
                ry="7"
                fill="#8b3a48"
              />
              <circle className="sa-mouth-o" cx="100" cy="95" r="3.5" fill="#8b3a48" />
              <path
                className="sa-mouth-wavy"
                d="M91 94 q4.5 -4 9 0 q4.5 4 9 0"
                stroke="var(--sa-line)"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
              />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
