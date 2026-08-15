"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { Curriculum } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The 3D scene (Three.js via React Three Fiber) is client-only: WebGL has no
 * server render, so it loads dynamically with a placeholder of the same size.
 */
const KnowledgeGraph3D = dynamic(
  () => import("./knowledge-graph-3d").then((m) => m.KnowledgeGraph3D),
  {
    ssr: false,
    loading: () => (
      <Skeleton className="h-[62dvh] min-h-96 w-full lg:h-auto lg:min-h-0 lg:flex-1" />
    ),
  },
);

/**
 * The Knowledge Graph home view: all 15 Concepts as glossy spheres in an
 * interactive 3D network, prerequisite edges as recommendations (never
 * locks), and the browser-local best Mastery per node. Clicking a sphere
 * selects the concept exactly as before; see knowledge-graph-3d.tsx.
 */
export function KnowledgeGraph({
  graphId,
  curriculum,
  mastery,
  selectedId,
  onSelect,
  className,
}: {
  /** Which knowledge graph is shown; scopes the saved ball arrangement. */
  graphId: string;
  curriculum: Curriculum;
  mastery: Record<string, number>;
  selectedId: string | null;
  onSelect: (conceptId: string) => void;
  className?: string;
}) {
  return (
    <KnowledgeGraph3D
      graphId={graphId}
      curriculum={curriculum}
      mastery={mastery}
      selectedId={selectedId}
      onSelect={onSelect}
      className={cn("lg:min-h-0 lg:flex-1", className)}
    />
  );
}
