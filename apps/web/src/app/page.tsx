"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  GraduationCap,
  Loader2,
  Play,
  RotateCcw,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { IntroOverlay } from "@/components/intro/intro-overlay";
import { KnowledgeGraph } from "@/components/knowledge-graph";
import { MODE_ICONS } from "@/components/mode-icon";
import { StudentPickerAvatar } from "@/components/student-picker-avatar";
import { STUDENT_ART } from "@/lib/student-art";
import { getCurriculum, startSession } from "@/lib/api";
import {
  loadMastery,
  saveStoredSession,
  sessionFromCreated,
} from "@/lib/session-store";
import type { Curriculum, Mode } from "@/lib/types";
import { MODES, MODE_BY_STUDENT_ID, STUDENT_IDS } from "@/lib/types";
import { cn } from "@/lib/utils";

type Step = 1 | 2;

/** How long the selected node's highlight is visible before auto-advancing. */
const ADVANCE_DELAY_MS = 450;

export default function HomePage() {
  const router = useRouter();

  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [mastery, setMastery] = useState<Record<string, number>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const advanceTimer = useRef<number | null>(null);

  const [conceptId, setConceptId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("confident");
  const [pending, setPending] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (!cancelled) setMastery(loadMastery());
        return getCurriculum();
      })
      .then((data) => {
        if (cancelled) return;
        setCurriculum(data);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load the curriculum.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    return () => {
      if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
    };
  }, []);

  function goTo(next: Step) {
    if (next === step || pending) return;
    if (next === 2 && !conceptId) return;
    if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
    setDirection(next > step ? "forward" : "back");
    setStep(next);
  }

  function selectConcept(id: string) {
    setConceptId(id);
    // Let the selection highlight land, then glide to step 2.
    if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
    advanceTimer.current = window.setTimeout(() => {
      setDirection("forward");
      setStep(2);
    }, ADVANCE_DELAY_MS);
  }

  const selected = curriculum?.concepts.find((c) => c.id === conceptId) ?? null;

  async function start() {
    if (!selected || pending) return;
    setPending(true);
    setStartError(null);
    try {
      const created = await startSession({ concept_id: selected.id, mode });
      saveStoredSession(sessionFromCreated(created));
      router.push(`/session/${created.session_id}`);
    } catch (err) {
      setStartError(
        err instanceof Error ? err.message : "Something went wrong.",
      );
      setPending(false);
    }
  }

  const stepAnimation = cn(
    "animate-in fade-in zoom-in-[0.98] duration-500 fill-mode-both",
    direction === "forward"
      ? "slide-in-from-right-10"
      : "slide-in-from-left-10",
  );

  return (
    <>
      <IntroOverlay />
      {/* On lg+ screens the whole step fits the viewport (no page scroll);
          smaller screens keep their natural vertical scroll. */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 overflow-x-hidden p-4 pb-24 lg:max-h-dvh lg:gap-3 lg:overflow-hidden lg:pb-14">
        {/* The concept step gives the whole viewport to the graph; the header
            only appears on the student step. */}
        {step === 2 && (
          <div className="space-y-2 pt-4 text-center lg:space-y-1 lg:pt-0">
            <div className="mx-auto flex size-12 items-center justify-center rounded-xl border bg-background shadow-sm lg:size-9">
              <GraduationCap className="size-6 lg:size-4.5" />
            </div>
            {/* Borel sits high above its baseline, so nudge it down optically. */}
            <h1 className="font-script pt-2 text-3xl leading-none lg:pt-1 lg:text-xl">
              Professor for a Day
            </h1>
            <p className="text-muted-foreground lg:text-sm">
              Don&apos;t learn from AI. Teach it — 15 machine-learning concepts,
              one AI student at a time.
            </p>
          </div>
        )}

        {step === 1 ? (
          <section
            key="step-1"
            className={cn(
              "flex flex-col gap-2 lg:min-h-0 lg:flex-1",
              stepAnimation,
            )}
          >
            {loading ? (
              <Skeleton className="h-72 w-full lg:h-auto lg:min-h-0 lg:flex-1" />
            ) : loadError || !curriculum ? (
              <div className="space-y-3">
                <Alert variant="destructive">
                  <AlertTitle>Could not load the curriculum</AlertTitle>
                  <AlertDescription>{loadError ?? "No data."}</AlertDescription>
                </Alert>
                <Button
                  variant="outline"
                  onClick={() => {
                    setLoading(true);
                    setReloadKey((k) => k + 1);
                  }}
                >
                  <RotateCcw className="size-4" /> Retry
                </Button>
              </div>
            ) : (
              <KnowledgeGraph
                className="lg:min-h-0 lg:flex-1"
                curriculum={curriculum}
                mastery={mastery}
                selectedId={conceptId}
                onSelect={selectConcept}
              />
            )}
            <p className="pb-1 text-center text-xs text-muted-foreground">
              Pick a concept to teach
            </p>
          </section>
        ) : (
          <section
            key="step-2"
            className={cn(
              "mx-auto w-full max-w-2xl space-y-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto",
              stepAnimation,
            )}
          >
            <Card>
              <CardContent className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Teaching</p>
                  <p className="truncate font-medium">{selected?.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {selected?.summary}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => goTo(1)}
                >
                  <ArrowLeft className="size-3.5" /> Change
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <h2 className="text-sm font-medium">Pick your student</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {(Object.keys(MODES) as Mode[]).map((m) => {
                  const info = MODES[m];
                  return (
                    <StudentPickerAvatar
                      key={m}
                      studentId={STUDENT_IDS[m]}
                      name={info.name}
                      label={info.label}
                      description={info.description}
                      imageSrc={STUDENT_ART[m]?.image}
                      arm={STUDENT_ART[m]?.arm}
                      icon={MODE_ICONS[m]}
                      selected={mode === m}
                      onSelect={(id) => setMode(MODE_BY_STUDENT_ID[id] ?? m)}
                    />
                  );
                })}
              </div>
            </div>

            {startError && (
              <Alert variant="destructive">
                <AlertTitle>Could not start the session</AlertTitle>
                <AlertDescription>{startError}</AlertDescription>
              </Alert>
            )}

            <Button
              className="w-full"
              size="lg"
              disabled={!selected || pending}
              onClick={start}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Start Teaching
            </Button>
          </section>
        )}
      </main>

      <nav
        aria-label="Setup progress"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-10 flex justify-center"
      >
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border bg-background/95 px-2 py-1.5 shadow-lg backdrop-blur">
          <StepPill
            label="Concept"
            active={step === 1}
            done={step === 2 && conceptId !== null}
            onClick={() => goTo(1)}
          >
            1
          </StepPill>
          <ChevronRight className="size-3.5 text-muted-foreground" />
          <StepPill
            label="Student"
            active={step === 2}
            done={false}
            disabled={!conceptId}
            onClick={() => goTo(2)}
          >
            2
          </StepPill>
        </div>
      </nav>
    </>
  );
}

function StepPill({
  label,
  active,
  done,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  done: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-current={active ? "step" : undefined}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground",
        !disabled && !active && "hover:text-foreground",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        className={cn(
          "flex size-5 items-center justify-center rounded-full text-[10px] tabular-nums transition-colors",
          active
            ? "bg-primary text-primary-foreground"
            : done
              ? "bg-emerald-600 text-white"
              : "bg-muted text-muted-foreground",
        )}
      >
        {done ? <Check className="size-3" /> : children}
      </span>
      {label}
    </button>
  );
}
