"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KnowledgeGraph } from "@/components/knowledge-graph";
import { SetupStepDots } from "@/components/setup-step-dots";
import { StartTeachingSphere } from "@/components/start-teaching-sphere";
import { ThemeToggle } from "@/components/theme-toggle";
import { StudentVideoPickerAvatar } from "@/components/student-video-picker-avatar";
import { CHARACTER_BY_MODE } from "@/lib/characters";
import { ApiError, getGraphCurriculum } from "@/lib/api";
import { loadMastery, stashPendingStart } from "@/lib/session-store";
import type { Curriculum, Mode } from "@/lib/types";
import { MODES, MODE_BY_STUDENT_ID } from "@/lib/types";
import { cn } from "@/lib/utils";

type Step = 1 | 2;

/** How long the selected node's highlight is visible before auto-advancing. */
const ADVANCE_DELAY_MS = 450;

export default function GraphPage() {
  // useSearchParams needs a Suspense boundary for prerendering.
  return (
    <Suspense fallback={null}>
      <GraphPageInner />
    </Suspense>
  );
}

function GraphPageInner() {
  const router = useRouter();
  const { graphId } = useParams<{ graphId: string }>();
  // When the report page links here it passes its session id: the graph is
  // then shown view-only — explore the web, start nothing — with a way back.
  const reportSessionId = useSearchParams().get("report");
  const viewOnly = reportSessionId !== null;

  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [mastery, setMastery] = useState<Record<string, number>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unknownGraph, setUnknownGraph] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const advanceTimer = useRef<number | null>(null);

  const [conceptId, setConceptId] = useState<string | null>(null);
  // No default student: nothing is highlighted until the learner picks one.
  const [mode, setMode] = useState<Mode | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (!cancelled) setMastery(loadMastery(graphId));
        return getGraphCurriculum(graphId);
      })
      .then((data) => {
        if (cancelled) return;
        setCurriculum(data);
        setLoadError(null);
        setUnknownGraph(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setUnknownGraph(err instanceof ApiError && err.code === "GRAPH_NOT_FOUND");
        setLoadError(
          err instanceof Error ? err.message : "Failed to load the knowledge graph.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [graphId, reloadKey]);

  useEffect(() => {
    return () => {
      if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
    };
  }, []);

  // The browser can restore this page with its old state (bfcache) when the
  // learner comes back from a session; a stale in-flight flag from that
  // navigation must not leave the start control permanently disabled.
  useEffect(() => {
    const reset = () => setPending(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  function goTo(next: Step) {
    if (next === step || pending) return;
    if (next === 2 && !conceptId) return;
    if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
    setDirection(next > step ? "forward" : "back");
    setStep(next);
  }

  function selectConcept(id: string) {
    if (viewOnly) return; // just looking — a click never starts the setup flow
    setConceptId(id);
    // Let the selection highlight land, then glide to step 2.
    if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
    advanceTimer.current = window.setTimeout(() => {
      setDirection("forward");
      setStep(2);
    }, ADVANCE_DELAY_MS);
  }

  const selected = curriculum?.concepts.find((c) => c.id === conceptId) ?? null;

  // Navigate immediately: the session page fires the actual start request and
  // waits for the opening question in place, so the learner never sits here
  // watching the sphere fill while the LLM thinks.
  function start() {
    if (!selected || !mode || pending) return;
    setPending(true);
    stashPendingStart({
      request: { graph_id: graphId, concept_id: selected.id, mode },
      concept_title: selected.title,
    });
    router.push("/session/new");
  }

  const stepAnimation = cn(
    "animate-in fade-in zoom-in-[0.98] duration-500 fill-mode-both",
    direction === "forward"
      ? "slide-in-from-right-10"
      : "slide-in-from-left-10",
  );

  return (
    <>
      {/* Above the full-viewport graph canvas (z-0). The way back to the
          graph picker is the first progress dot below. */}
      {viewOnly && (
        <Button
          variant="outline"
          size="sm"
          className="fixed top-3 left-3 z-10"
          nativeButton={false}
          render={<Link href={`/session/${reportSessionId}/report`} />}
        >
          <ArrowLeft className="size-4" /> Back to report
        </Button>
      )}
      <ThemeToggle className="fixed top-3 right-3 z-10" />
      {/* On lg+ screens the whole step fits the viewport (no page scroll);
          smaller screens keep their natural vertical scroll. */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 overflow-x-hidden p-4 pb-24 lg:max-h-dvh lg:gap-3 lg:overflow-hidden lg:pb-14">
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
                  <AlertTitle>
                    {unknownGraph
                      ? "This knowledge graph does not exist"
                      : "Could not load the knowledge graph"}
                  </AlertTitle>
                  <AlertDescription>{loadError ?? "No data."}</AlertDescription>
                </Alert>
                {unknownGraph ? (
                  <Button
                    variant="outline"
                    nativeButton={false}
                    render={<Link href="/" />}
                  >
                    <ArrowLeft className="size-4" /> Back to all graphs
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setLoading(true);
                      setReloadKey((k) => k + 1);
                    }}
                  >
                    <RotateCcw className="size-4" /> Retry
                  </Button>
                )}
              </div>
            ) : (
              <KnowledgeGraph
                className="lg:min-h-0 lg:flex-1"
                graphId={graphId}
                curriculum={curriculum}
                mastery={mastery}
                selectedId={conceptId}
                onSelect={selectConcept}
              />
            )}
            {/* View mode shows no caption: the 3D scene's own hint bar
                already says how to drag/rotate/zoom. */}
            {!viewOnly && (
              <p className="pb-1 text-center text-xs text-muted-foreground">
                Pick a concept to teach
              </p>
            )}
          </section>
        ) : (
          <section
            key="step-2"
            className={cn(
              "mx-auto flex w-full max-w-2xl flex-1 flex-col lg:min-h-0 lg:overflow-y-auto",
              stepAnimation,
            )}
          >
            {/* my-auto centers the short step vertically without clipping if
                it ever overflows (unlike justify-center inside overflow-y). */}
            <div className="my-auto space-y-4">
              <div className="spick grid gap-3 sm:grid-cols-3">
                {(Object.keys(MODES) as Mode[]).map((m) => {
                  const info = MODES[m];
                  const select = (id: string) =>
                    setMode(MODE_BY_STUDENT_ID[id] ?? m);

                  // Every student is a pre-rendered video character; the card
                  // and interaction behaviour are shared, only the clip set
                  // (lib/characters.ts) differs per student.
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
                disabled={!selected || !mode}
                onStart={start}
              />
            </div>
          </section>
        )}
      </main>

      {/* The setup flow's dots make no sense while just viewing the graph
          from a report — the only navigation there is "Back to report". */}
      {!viewOnly && (
        <SetupStepDots
          steps={[
            {
              label: "Pick a graph",
              onClick: () => {
                if (!pending) router.push("/");
              },
            },
            { label: "Pick a concept", active: step === 1, onClick: () => goTo(1) },
            {
              label: "Pick a student",
              active: step === 2,
              disabled: !conceptId,
              onClick: () => goTo(2),
            },
          ]}
        />
      )}
    </>
  );
}
