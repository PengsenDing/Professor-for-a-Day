"use client";

import { useState } from "react";
import { CharacterVideoAvatar } from "@/components/character-video-avatar";
import type { CharacterId } from "@/lib/characters";
import { cn } from "@/lib/utils";

/**
 * Setup-flow card for a student rendered from pre-rendered video clips.
 *
 * Deliberately thin, same shape as `Student3DPickerAvatar`: it owns the text
 * (name, mode label, description) and nothing about the character —
 * everything visual and behavioural lives in `CharacterVideoAvatar` and the
 * per-character clip registry in lib/characters.ts, so all three students
 * (and any future ones) share this layout unchanged. There is deliberately
 * no card box around a student: selection is carried entirely by the
 * avatar's ring, glow and check badge.
 *
 * The circular avatar is the real, focusable control. The surrounding area
 * forwards mouse clicks and hover to it as a convenience; keyboard and
 * assistive-technology users get the button itself, which carries the label.
 */
export function StudentVideoPickerAvatar({
  characterId,
  name,
  label,
  description,
  isListening = false,
  isSpeaking = false,
  selected,
  onSelect,
  className,
}: {
  characterId: CharacterId;
  name: string;
  /** Short mode label shown next to the name, e.g. "Beginner". */
  label?: string;
  description?: string;
  isListening?: boolean;
  isSpeaking?: boolean;
  selected: boolean;
  onSelect: (studentId: string) => void;
  className?: string;
}) {
  // Bumping this asks the avatar to greet, so hovering anywhere on the card
  // reads the same as hovering the character itself.
  const [greetSignal, setGreetSignal] = useState(0);

  return (
    <div
      onPointerEnter={() => setGreetSignal((n) => n + 1)}
      // Selection is idempotent, so a click landing on the inner button and
      // bubbling to here is harmless.
      onClick={() => onSelect(characterId)}
      className={cn(
        "spick-card flex cursor-pointer flex-col items-center gap-2 p-2 text-center",
        className,
      )}
    >
      {/* The idle drift lives on a wrapper (paused while this card is
          hovered) so it never fights the avatar's own hover transform. */}
      <span className="spick-float inline-block">
        <CharacterVideoAvatar
          characterId={characterId}
          isListening={isListening}
          isSpeaking={isSpeaking}
          selected={selected}
          onSelect={() => onSelect(characterId)}
          greetSignal={greetSignal}
          label={`Select ${name} as your student`}
        />
      </span>

      <span className="mt-1 font-medium leading-tight">{name}</span>
      {/* Mode label + description, revealed together on hover/focus (see
          .spick-desc); always visible on touch devices, which have no hover
          to reveal them with. */}
      {(label || description) && (
        <span className="spick-desc text-xs text-muted-foreground">
          {label && (
            <span className="block font-medium text-foreground">{label}</span>
          )}
          {description}
        </span>
      )}
    </div>
  );
}
