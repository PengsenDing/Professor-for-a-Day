"use client";

import { useState } from "react";
import { LilyAvatar } from "@/components/lily";
import { cn } from "@/lib/utils";

/**
 * Setup-flow card for a student who has a 3D character.
 *
 * Deliberately thin: it owns the card chrome (name, mode label, description)
 * and nothing about the character. Everything visual and behavioural about
 * Lily lives in `components/lily/`, so Max and Sokrates can reuse this card
 * once they have their own avatar components — the only per-student thing
 * here is which avatar to render.
 *
 * The circular avatar is the real, focusable control. The surrounding card
 * forwards mouse clicks and hover to it as a convenience; keyboard and
 * assistive-technology users get the button itself, which carries the label.
 */
export function Student3DPickerAvatar({
  studentId,
  name,
  label,
  description,
  modelUrl,
  isListening = false,
  isSpeaking = false,
  selected,
  onSelect,
  className,
}: {
  studentId: string;
  name: string;
  label?: string;
  description?: string;
  modelUrl?: string;
  isListening?: boolean;
  isSpeaking?: boolean;
  selected: boolean;
  onSelect: (studentId: string) => void;
  className?: string;
}) {
  // Bumping this asks the avatar to greet, so hovering anywhere on the card
  // reads the same as hovering Lily herself.
  const [greetSignal, setGreetSignal] = useState(0);

  return (
    <div
      onPointerEnter={() => setGreetSignal((n) => n + 1)}
      // Selection is idempotent, so a click landing on the inner button and
      // bubbling to here is harmless.
      onClick={() => onSelect(studentId)}
      className={cn(
        "group flex cursor-pointer flex-col items-center gap-2 rounded-xl border p-4 text-center transition-colors",
        selected ? "border-primary bg-primary/5" : "hover:bg-muted/40",
        className,
      )}
    >
      <LilyAvatar
        modelUrl={modelUrl}
        isListening={isListening}
        isSpeaking={isSpeaking}
        isSelected={selected}
        onSelect={() => onSelect(studentId)}
        greetSignal={greetSignal}
        label={`Select ${name} as your student`}
      />

      <span className="mt-1 leading-tight">
        <span className="font-medium">{name}</span>
        {label && (
          <span className="text-xs font-normal text-muted-foreground"> · {label}</span>
        )}
      </span>
      {description && (
        <span className="text-xs text-muted-foreground">{description}</span>
      )}
    </div>
  );
}
