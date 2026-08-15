"use client";

import { useState } from "react";
import { LilyAvatar } from "@/components/lily";
import type { LilyAnimationState } from "@/components/lily";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Development harness for the 3D student avatars.
 *
 * `isSpeaking` and `isListening` are normally owned by a Teaching Session —
 * audio playback and the microphone. This page drives them by hand so every
 * animation state can be exercised and reviewed without a running session,
 * and so the same checks are repeatable when Max and Sokrates arrive.
 *
 * Not linked from anywhere in the product; reachable at /dev/lily.
 */
export default function LilyDevPage() {
  const [isSpeaking, setSpeaking] = useState(false);
  const [isListening, setListening] = useState(false);
  const [isSelected, setSelected] = useState(false);
  const [greetSignal, setGreetSignal] = useState(0);
  const [state, setState] = useState<LilyAnimationState>("idle");
  const [big, setBig] = useState(true);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Lily — 3D avatar harness</h1>
        <p className="text-sm text-muted-foreground">
          Drive the animation states directly. Hover her to greet.
        </p>
      </div>

      <div className="flex min-h-[26rem] items-center justify-center">
        <LilyAvatar
          isSpeaking={isSpeaking}
          isListening={isListening}
          isSelected={isSelected}
          greetSignal={greetSignal}
          onStateChange={setState}
          onSelect={() => setSelected((s) => !s)}
          className={cn(big && "size-96 sm:size-96")}
        />
      </div>

      <p className="text-sm">
        Reported state:{" "}
        <code className="rounded bg-muted px-2 py-0.5 font-mono font-medium">
          {state}
        </code>
      </p>

      <div className="flex flex-wrap justify-center gap-2">
        <Button
          variant={isSpeaking ? "default" : "outline"}
          onClick={() => setSpeaking((v) => !v)}
        >
          isSpeaking: {String(isSpeaking)}
        </Button>
        <Button
          variant={isListening ? "default" : "outline"}
          onClick={() => setListening((v) => !v)}
        >
          isListening: {String(isListening)}
        </Button>
        <Button
          variant={isSelected ? "default" : "outline"}
          onClick={() => setSelected((v) => !v)}
        >
          isSelected: {String(isSelected)}
        </Button>
        <Button variant="outline" onClick={() => setGreetSignal((n) => n + 1)}>
          Greet
        </Button>
        <Button variant="outline" onClick={() => setBig((v) => !v)}>
          {big ? "Picker size" : "Large"}
        </Button>
      </div>
    </main>
  );
}
