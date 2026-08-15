"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GitBranch, Loader2, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IntroOverlay } from "@/components/intro/intro-overlay";
import { SetupStepDots } from "@/components/setup-step-dots";
import { ThemeToggle } from "@/components/theme-toggle";
import { deleteGraph, getGraphs } from "@/lib/api";
import { clearGraphLocalState } from "@/lib/session-store";
import type { GraphSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Landing page: every knowledge graph as a card, plus the "start a new graph
 * from scratch" card. Picking a graph leads to its concept-select page
 * (/graphs/[graphId]); the new-graph card leads to the freeform topic flow
 * (/new), whose session ends by summarizing the conversation into a graph.
 */
export default function GraphPickerPage() {
  const router = useRouter();

  const [graphs, setGraphs] = useState<GraphSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getGraphs()
      .then((data) => {
        if (cancelled) return;
        setGraphs(data.graphs);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load the knowledge graphs.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <>
      <IntroOverlay />
      <ThemeToggle className="fixed top-3 right-3 z-10" />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 p-4 pb-16 pt-14 sm:pt-20">
        <header className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Your knowledge graphs
          </h1>
          <p className="text-sm text-muted-foreground">
            Pick a graph to teach in — or teach something brand new and let a
            graph grow out of the conversation.
          </p>
        </header>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-xl" />
            ))}
          </div>
        ) : loadError || !graphs ? (
          <div className="mx-auto w-full max-w-xl space-y-3">
            <Alert variant="destructive">
              <AlertTitle>Could not load the knowledge graphs</AlertTitle>
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
          <>
            {deleteError && (
              <Alert variant="destructive" className="mx-auto max-w-xl">
                <AlertTitle>Could not delete the graph</AlertTitle>
                <AlertDescription>{deleteError}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {graphs.map((graph, index) => (
                <GraphCard
                  key={graph.id}
                  graph={graph}
                  index={index}
                  onOpen={() => router.push(`/graphs/${graph.id}`)}
                  onDeleted={() => {
                    setDeleteError(null);
                    setGraphs(
                      (current) =>
                        current?.filter((g) => g.id !== graph.id) ?? current,
                    );
                  }}
                  onDeleteError={(message) => setDeleteError(message)}
                />
              ))}
              <NewGraphCard onOpen={() => router.push("/new")} />
            </div>
          </>
        )}
      </main>

      {/* The later steps only exist once a graph is chosen, so their dots sit
          disabled here — the same three-dot strip the wizard shows. */}
      <SetupStepDots
        steps={[
          { label: "Pick a graph", active: true },
          { label: "Pick a concept", disabled: true },
          { label: "Pick a student", disabled: true },
        ]}
      />
    </>
  );
}

function GraphCard({
  graph,
  index,
  onOpen,
  onDeleted,
  onDeleteError,
}: {
  graph: GraphSummary;
  index: number;
  onOpen: () => void;
  onDeleted: () => void;
  onDeleteError: (message: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteGraph(graph.id);
      // The server copy is gone; drop this graph's browser-local traces too.
      clearGraphLocalState(graph.id);
      onDeleted();
    } catch (err) {
      onDeleteError(
        err instanceof Error ? err.message : "Something went wrong.",
      );
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <div
      className={cn(
        "group relative animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500",
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex h-40 w-full flex-col justify-between rounded-xl border bg-card p-4 text-left shadow-sm transition-all",
          "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        )}
      >
        <div className="flex w-full items-start justify-between gap-2">
          <GitBranch className="size-5 text-primary/70 transition-transform group-hover:scale-110" />
          <Badge variant={graph.source === "builtin" ? "secondary" : "outline"}>
            {graph.source === "builtin" ? "Built-in" : "Yours"}
          </Badge>
        </div>
        <div className="space-y-1">
          <div className="line-clamp-2 font-medium leading-snug">{graph.title}</div>
          <p className="text-xs text-muted-foreground">
            {graph.concept_count}{" "}
            {graph.concept_count === 1 ? "concept" : "concepts"}
            {graph.created_at
              ? ` · started ${new Date(graph.created_at).toLocaleDateString()}`
              : " · curated"}
          </p>
        </div>
      </button>

      {/* Only user graphs are deletable; the builtin graph has no affordance
          at all (the backend refuses it regardless). */}
      {graph.source === "user" && !confirming && (
        <button
          type="button"
          aria-label={`Delete “${graph.title}”`}
          title="Delete this graph"
          onClick={() => setConfirming(true)}
          className={cn(
            "absolute right-3 bottom-3 rounded-md p-1.5 text-muted-foreground/60 transition-all",
            "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            "hover:bg-destructive/10 hover:text-destructive",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive",
          )}
        >
          <Trash2 className="size-4" />
        </button>
      )}

      {confirming && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/40 bg-card/95 p-4 text-center backdrop-blur-sm">
          <p className="text-sm">
            Delete <span className="font-medium">“{graph.title}”</span>?
          </p>
          <p className="text-xs text-muted-foreground">
            The graph and its generated rubrics are removed for good. Past
            session reports are kept.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Delete
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={deleting}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewGraphCard({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-4 text-center transition-all",
        "text-muted-foreground hover:-translate-y-0.5 hover:border-primary/60 hover:text-foreground hover:shadow-md",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500",
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full border border-dashed transition-colors group-hover:border-primary/60 group-hover:text-primary">
        <Plus className="size-5" />
      </span>
      <span className="space-y-0.5">
        <span className="block font-medium">Start a new knowledge graph</span>
        <span className="flex items-center justify-center gap-1 text-xs">
          <Sparkles className="size-3" /> Teach any topic from scratch
        </span>
      </span>
    </button>
  );
}
