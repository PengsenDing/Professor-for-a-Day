"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CharacterVideoAvatar } from "@/components/character-video-avatar";
import { StudentVideoPickerAvatar } from "@/components/student-video-picker-avatar";
import { CHARACTERS, type CharacterId } from "@/lib/characters";

/**
 * Dev-only testbed for the pre-rendered video characters (not linked from the
 * app). Top row: raw avatars driven by the same audio-state booleans the
 * session page uses (isUserSpeaking → listening, isAiSpeaking → speaking,
 * speaking wins). Bottom row: the real picker cards with hover greeting and
 * selection. Useful when swapping in better clip renders.
 */
export default function CharactersDevPage() {
  const ids = Object.keys(CHARACTERS) as CharacterId[];

  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [greetSignal, setGreetSignal] = useState(0);
  const [selected, setSelected] = useState<CharacterId | null>(null);

  return (
    <main className="mx-auto max-w-4xl space-y-10 p-8">
      <section className="space-y-4">
        <h1 className="text-lg font-semibold">Character video avatars</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={isUserSpeaking ? "default" : "outline"}
            aria-pressed={isUserSpeaking}
            onClick={() => setIsUserSpeaking((v) => !v)}
          >
            isUserSpeaking → listening
          </Button>
          <Button
            size="sm"
            variant={isAiSpeaking ? "default" : "outline"}
            aria-pressed={isAiSpeaking}
            onClick={() => setIsAiSpeaking((v) => !v)}
          >
            isAiSpeaking → speaking
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setGreetSignal((n) => n + 1)}
          >
            greet once
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-8">
          {ids.map((id) => (
            <div key={id} className="flex flex-col items-center gap-2">
              <CharacterVideoAvatar
                characterId={id}
                isListening={isUserSpeaking}
                isSpeaking={isAiSpeaking}
                greetSignal={greetSignal}
              />
              <span className="text-xs text-muted-foreground">
                {CHARACTERS[id].name}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Hover an avatar for its greeting. Speaking outranks listening;
          releasing both returns to idle.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium">Picker cards</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {ids.map((id) => (
            <StudentVideoPickerAvatar
              key={id}
              characterId={id}
              name={CHARACTERS[id].name}
              label="Demo"
              selected={selected === id}
              onSelect={(studentId) => setSelected(studentId as CharacterId)}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
