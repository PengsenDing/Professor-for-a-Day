"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { StartTeachingSphere } from "@/components/start-teaching-sphere";
import { ThemeToggle } from "@/components/theme-toggle";
import { StudentVideoPickerAvatar } from "@/components/student-video-picker-avatar";
import { CHARACTER_BY_MODE } from "@/lib/characters";
import { stashPendingStart } from "@/lib/session-store";
import type { Mode } from "@/lib/types";
import { MAX_TOPIC_LENGTH, MODES, MODE_BY_STUDENT_ID } from "@/lib/types";

/**
 * The "start a new knowledge graph from scratch" flow: name what you want to
 * teach, pick a student, and teach. A rubric is generated for the topic at
 * session start; when the session ends, the conversation is summarized into a
 * brand-new knowledge graph (the ending envelope's graph_update carries it).
 */
export default function NewGraphPage() {
  const router = useRouter();

  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState<Mode | null>(null);
  const [pending, setPending] = useState(false);

  // The browser can restore this page with stale in-flight state (bfcache)
  // when the learner navigates back from a session.
  useEffect(() => {
    const reset = () => setPending(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  const trimmed = topic.trim();
  const ready = trimmed.length > 0 && trimmed.length <= MAX_TOPIC_LENGTH;

  // Navigate immediately: the session page fires the actual start request and
  // waits for the opening question in place, so the learner never sits here
  // watching the sphere fill while the rubric and question are generated.
  function start() {
    if (!ready || !mode || pending) return;
    setPending(true);
    stashPendingStart({
      request: { topic: trimmed, mode },
      concept_title: trimmed,
    });
    router.push("/session/new");
  }

  return (
    <>
      <ThemeToggle className="fixed top-3 right-3 z-10" />

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col p-4 pb-16 pt-16 sm:pt-24">
        <div className="my-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <header className="space-y-1 text-center">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              What do you want to teach?
            </h1>
            <p className="text-sm text-muted-foreground">
              Teach it well — when the session ends, your explanation becomes a
              new knowledge graph you can keep growing.
            </p>
          </header>

          <div className="space-y-1.5">
            <Input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              maxLength={MAX_TOPIC_LENGTH}
              placeholder={'e.g. "How compilers work" or "Bayes’ theorem"'}
              aria-label="Topic to teach"
              disabled={pending}
              onKeyDown={(event) => {
                if (event.key === "Enter") start();
              }}
            />
            <p className="text-right text-xs text-muted-foreground">
              {trimmed.length}/{MAX_TOPIC_LENGTH}
            </p>
          </div>

          <div className="spick grid gap-3 sm:grid-cols-3">
            {(Object.keys(MODES) as Mode[]).map((m) => {
              const info = MODES[m];
              const select = (id: string) => setMode(MODE_BY_STUDENT_ID[id] ?? m);
              return (
                <StudentVideoPickerAvatar
                  key={m}
                  characterId={CHARACTER_BY_MODE[m]}
                  name={info.name}
                  label={info.label}
                  description={info.description}
                  selected={mode === m}
                  onSelect={select}
                />
              );
            })}
          </div>

          <StartTeachingSphere
            className="pt-2"
            pending={pending}
            disabled={!ready || !mode}
            onStart={start}
          />
        </div>
      </main>
    </>
  );
}
