"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  GitBranch,
  Lightbulb,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportScoreSphere } from "@/components/report-score-sphere";
import { finishSession } from "@/lib/api";
import {
  applyFinished,
  loadStoredSession,
  recordMastery,
  saveStoredSession,
} from "@/lib/session-store";
import type {
  DemonstratedEvidence,
  GraphUpdate,
  TeacherReport,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<TeacherReport | null>(null);
  const [conceptTitle, setConceptTitle] = useState<string | null>(null);
  const [graphId, setGraphId] = useState<string | null>(null);
  const [graphUpdate, setGraphUpdate] = useState<GraphUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // localStorage is client-only; defer the read past hydration. If there is
    // no local report yet, finishing is idempotent, so this both ends an
    // active session and re-fetches the stored report after a refresh.
    Promise.resolve()
      .then(() => {
        const stored = loadStoredSession(id);
        if (!cancelled) {
          setConceptTitle(stored?.concept.title ?? null);
          setGraphId(stored?.graph_id ?? null);
          setGraphUpdate(stored?.graph_update ?? null);
        }
        if (stored?.report) return stored.report;
        return finishSession(id).then((finished) => {
          if (stored && !cancelled) {
            const applied = applyFinished(stored, finished);
            saveStoredSession(applied);
            setGraphId(applied.graph_id);
            setGraphUpdate(applied.graph_update);
            if (applied.graph_id !== null) {
              recordMastery(
                applied.graph_id,
                applied.concept.id,
                finished.report.final_percent,
              );
            }
          }
          return finished.report;
        });
      })
      .then((data) => {
        if (cancelled) return;
        setReport(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load the report.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </main>
    );
  }

  if (error || !report) {
    return (
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <Alert variant="destructive">
            <AlertTitle>Could not load the report</AlertTitle>
            <AlertDescription>{error ?? "Report unavailable."}</AlertDescription>
          </Alert>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setLoading(true);
                setError(null);
                setReloadKey((k) => k + 1);
              }}
            >
              <RotateCcw className="size-4" /> Retry
            </Button>
            <Button
              variant="ghost"
              nativeButton={false}
              render={<Link href={`/session/${id}`} />}
            >
              <ArrowLeft className="size-4" /> Back to session
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4 pb-12">
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={`/session/${id}`} />}
        >
          <ArrowLeft className="size-4" /> Back to session
        </Button>
      </div>

      {/* The score leads, frameless — the ball floats free on the page;
          right under it sits the one way to look at the knowledge graph
          (view-only, with a "Back to report" return). */}
      <Card className="border-none bg-transparent shadow-none">
        <CardContent className="flex flex-col items-center gap-4 py-6 text-center">
          {/* "Teacher Report" caps the concept being taught; below them the
              floating ball's water level is the score, the way the knowledge
              graph shows Mastery; the number sits below the ball. */}
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Teacher Report
            </p>
            {conceptTitle && (
              <h1 className="text-2xl font-semibold tracking-tight">
                {conceptTitle}
              </h1>
            )}
          </div>
          <ReportScoreSphere percent={report.final_percent} />
          <p className="text-5xl font-semibold tabular-nums tracking-tight">
            {report.final_percent}
            <span className="text-2xl text-muted-foreground">%</span>
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            {report.mastery_achieved
              ? "Accomplished! Your student walked away with a complete, corrected mental model."
              : report.final_percent >= 50
                ? "Good progress — a few rubric points or an open misconception still need your attention."
                : "A rough first lesson — check the gaps below and try another round."}
          </p>
          {(graphUpdate || graphId) && (
            <Button
              className="mt-1"
              nativeButton={false}
              render={
                // ?report= opens the graph view-only (no setup flow) with a
                // "Back to report" button that returns here.
                <Link
                  href={`/graphs/${graphUpdate?.graph_id ?? graphId}?report=${id}`}
                />
              }
            >
              <GitBranch className="size-4" />
              {graphUpdate?.created
                ? "Explore your new knowledge graph"
                : "See the knowledge graph"}
            </Button>
          )}
        </CardContent>
      </Card>

      {graphUpdate && (
        <Card className="gap-3 border-primary/40 py-4">
          <CardHeader className="px-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <GitBranch className="size-4 text-primary" />
              {graphUpdate.created
                ? "Your teaching became a knowledge graph"
                : "Your knowledge graph grew"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <p className="text-sm">
              {graphUpdate.created ? (
                <>
                  This session created{" "}
                  <span className="font-medium">
                    “{graphUpdate.graph_title}”
                  </span>{" "}
                  with {graphUpdate.added_concepts.length}{" "}
                  {graphUpdate.added_concepts.length === 1
                    ? "concept"
                    : "concepts"}
                  .
                </>
              ) : graphUpdate.added_concepts.length > 0 ? (
                <>
                  This session added{" "}
                  <span className="font-medium">
                    {graphUpdate.added_concepts
                      .map((concept) => concept.title)
                      .join(", ")}
                  </span>{" "}
                  to “{graphUpdate.graph_title}”.
                </>
              ) : (
                <>
                  “{graphUpdate.graph_title}” was reviewed — nothing new came up
                  this time.
                </>
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {report.evidence?.length ? (
        <EvidenceSection evidence={report.evidence} />
      ) : (
        // Reports stored before the evidence field existed fall back to labels.
        <ReportSection
          icon={Sparkles}
          iconClass="text-violet-500"
          title="What you explained well"
          items={report.explained_well}
          empty="No rubric points were confirmed this session."
        />
      )}
      <ReportSection
        icon={ShieldCheck}
        iconClass="text-emerald-600"
        title="Misconceptions you corrected"
        items={report.misconceptions_corrected}
        empty="No misconceptions were corrected."
      />
      <ReportSection
        icon={AlertTriangle}
        iconClass="text-amber-500"
        title="Gaps and accidental implications"
        items={report.gaps_and_accidental_implications}
        empty="Your explanations left no gaps or misleading implications. Well done!"
      />

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Lightbulb className="size-4 text-sky-500" />
            One thing to improve
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          <p className="text-sm">{report.improvement_suggestion}</p>
        </CardContent>
      </Card>

      {report.recommended_next_concept && (
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ArrowRight className="size-4 text-primary" />
              Teach next
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3 px-4">
            <p className="text-sm">
              Recommended:{" "}
              <span className="font-medium">
                {report.recommended_next_concept.title}
              </span>
            </p>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href={graphId ? `/graphs/${graphId}` : "/"} />}
            >
              Pick it on the graph <ArrowRight className="size-3.5" />
            </Button>
          </CardContent>
        </Card>
      )}
    </main>
  );
}

/** Why each point scored: the point, and the learner's own words that earned it. */
function EvidenceSection({ evidence }: { evidence: DemonstratedEvidence[] }) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-violet-500" />
          What you explained well — and the words that proved it
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <ul className="space-y-3 text-sm">
          {evidence.map((item) => (
            <li key={item.point.id} className="flex items-start gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
              <div className="space-y-1">
                <p>{item.point.label}</p>
                {item.quote ? (
                  <blockquote className="border-l-2 border-violet-500/40 pl-2 text-muted-foreground">
                    <span className="italic">&ldquo;{item.quote}&rdquo;</span>
                    {" — you, turn "}
                    {item.turn_number}
                  </blockquote>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Demonstrated in turn {item.turn_number}.
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ReportSection({
  icon: Icon,
  iconClass,
  title,
  items,
  empty,
}: {
  icon: LucideIcon;
  iconClass: string;
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Icon className={`size-4 ${iconClass}`} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        {items.length > 0 ? (
          <ul className="space-y-1.5 text-sm">
            {items.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{empty}</p>
        )}
      </CardContent>
    </Card>
  );
}
