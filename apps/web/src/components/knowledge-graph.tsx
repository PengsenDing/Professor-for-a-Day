"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trophy } from "lucide-react";
import type { Concept, Curriculum } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Group concepts into prerequisite layers (top = no prerequisites), ordering
 * each layer by the average position of its parents to reduce edge crossings.
 */
function computeLayers(curriculum: Curriculum): Concept[][] {
  const parents = new Map<string, string[]>();
  for (const c of curriculum.concepts) parents.set(c.id, []);
  for (const e of curriculum.edges) parents.get(e.to)?.push(e.from);

  // Depth = longest prerequisite chain (edges are acyclic per the contract).
  const depths = new Map<string, number>();
  const depthOf = (id: string): number => {
    const known = depths.get(id);
    if (known !== undefined) return known;
    depths.set(id, 0); // cycle guard
    const ps = parents.get(id) ?? [];
    const depth = ps.length === 0 ? 0 : 1 + Math.max(...ps.map(depthOf));
    depths.set(id, depth);
    return depth;
  };
  curriculum.concepts.forEach((c) => depthOf(c.id));

  const maxDepth = Math.max(...depths.values());
  const layers: Concept[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (const c of curriculum.concepts) layers[depths.get(c.id)!].push(c);

  const position = new Map<string, number>();
  layers.forEach((layer, depth) => {
    layer.sort((a, b) => {
      const avg = (c: Concept) => {
        const ps = (parents.get(c.id) ?? [])
          .map((p) => position.get(p))
          .filter((x): x is number => x !== undefined);
        return ps.length ? ps.reduce((s, x) => s + x, 0) / ps.length : 0.5;
      };
      return avg(a) - avg(b);
    });
    const width = Math.max(1, layer.length - 1);
    layer.forEach((c, i) => position.set(c.id, depth === 0 ? 0.5 : i / width));
  });

  return layers;
}

/**
 * The Knowledge Graph home view: all 15 Concepts, prerequisite edges as
 * recommendations (never locks), and the browser-local best Mastery per node.
 *
 * Fully responsive: layers flow top-to-bottom and wrap on narrow screens;
 * edges are drawn from the rendered node positions, so they adapt to any
 * viewport (laptop or smartphone) without horizontal scrolling.
 */
export function KnowledgeGraph({
  curriculum,
  mastery,
  selectedId,
  onSelect,
  className,
}: {
  curriculum: Curriculum;
  mastery: Record<string, number>;
  selectedId: string | null;
  onSelect: (conceptId: string) => void;
  className?: string;
}) {
  const layers = useMemo(() => computeLayers(curriculum), [curriculum]);

  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const [edges, setEdges] = useState<{ id: string; d: string }[]>([]);
  const [canvas, setCanvas] = useState({ width: 0, height: 0 });

  // Draw edges from measured node rectangles. ResizeObserver fires on mount
  // and whenever the container reflows (viewport resize, font load, wrap).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const cRect = container.getBoundingClientRect();
      const anchors = new Map<
        string,
        { x: number; top: number; bottom: number }
      >();
      for (const [id, el] of nodeRefs.current) {
        const r = el.getBoundingClientRect();
        anchors.set(id, {
          x: r.left - cRect.left + r.width / 2,
          top: r.top - cRect.top,
          bottom: r.bottom - cRect.top,
        });
      }
      setEdges(
        curriculum.edges.flatMap((e) => {
          const from = anchors.get(e.from);
          const to = anchors.get(e.to);
          if (!from || !to || to.top <= from.bottom) return [];
          const bend = Math.max(16, (to.top - from.bottom) * 0.6);
          return [
            {
              id: `${e.from}->${e.to}`,
              d: `M ${from.x} ${from.bottom} C ${from.x} ${from.bottom + bend}, ${to.x} ${to.top - bend}, ${to.x} ${to.top}`,
            },
          ];
        }),
      );
      setCanvas({ width: cRect.width, height: cRect.height });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    // Re-measure when any node changes size (e.g. a mastery badge updates).
    for (const el of nodeRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [curriculum, layers]);

  return (
    <div
      ref={containerRef}
      className={cn("relative flex w-full flex-col py-2", className)}
    >
      <svg
        className="pointer-events-none absolute inset-0"
        width={canvas.width}
        height={canvas.height}
        aria-hidden
      >
        {edges.map((e) => (
          <path
            key={e.id}
            d={e.d}
            fill="none"
            className="stroke-border"
            strokeWidth={1.5}
          />
        ))}
      </svg>

      {/* When the container is height-constrained (fit-to-viewport on laptops),
          justify-between spreads the layers; the gap is only a minimum. */}
      <div className="relative flex flex-col justify-between gap-5 sm:gap-6 lg:min-h-0 lg:flex-1 lg:gap-2">
        {layers.map((layer, depth) => (
          <div
            key={depth}
            className="flex flex-wrap items-stretch justify-center gap-2 sm:gap-4"
          >
            {layer.map((concept) => {
              const best = mastery[concept.id] ?? 0;
              const accomplished = best === 100;
              const developing = best > 0 && best < 100;
              const selected = selectedId === concept.id;
              return (
                <button
                  key={concept.id}
                  ref={(el) => {
                    if (el) nodeRefs.current.set(concept.id, el);
                    else nodeRefs.current.delete(concept.id);
                  }}
                  type="button"
                  onClick={() => onSelect(concept.id)}
                  title={concept.summary}
                  aria-pressed={selected}
                  className={cn(
                    "flex w-[9.5rem] flex-col justify-center gap-1 rounded-lg border bg-background px-3 py-2 text-left shadow-sm transition-colors sm:w-44 lg:w-52",
                    accomplished &&
                      "border-emerald-500/60 bg-emerald-50 dark:bg-emerald-500/10",
                    selected
                      ? "border-primary ring-2 ring-primary"
                      : "hover:border-primary/50",
                  )}
                >
                  <span className="text-xs font-medium leading-tight sm:text-sm">
                    {concept.title}
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1 text-[10px] tabular-nums sm:text-[11px]",
                      accomplished
                        ? "font-medium text-emerald-600"
                        : developing
                          ? "text-amber-600"
                          : "text-muted-foreground",
                    )}
                  >
                    {accomplished ? (
                      <>
                        <Trophy className="size-3" /> Accomplished
                      </>
                    ) : developing ? (
                      `Best ${best}%`
                    ) : (
                      "Not attempted"
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
