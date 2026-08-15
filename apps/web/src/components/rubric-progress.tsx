import { CheckCircle2, ListChecks } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { RubricPointRef } from "@/lib/types";

/**
 * The rubric points the Judge has confirmed so far this session. The full
 * rubric is hidden by design — only demonstrated points are ever revealed.
 * Rendered frameless (no border, transparent card) inside the insight
 * sphere's blur-backdrop panel.
 */
export function RubricProgress({ points }: { points: RubricPointRef[] }) {
  return (
    <Card className="gap-4 border-0 bg-transparent py-6 shadow-none">
      <CardHeader className="px-6">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <ListChecks className="size-5 text-muted-foreground" />
          Points you&apos;ve demonstrated
        </CardTitle>
      </CardHeader>
      <CardContent className="px-6">
        {points.length > 0 ? (
          <ul className="space-y-3">
            {points.map((point) => (
              <li
                key={point.id}
                className="flex items-start gap-3 text-base animate-in fade-in slide-in-from-bottom-1 duration-500"
              >
                <CheckCircle2 className="mt-1 size-5 shrink-0 text-emerald-600" />
                {point.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-base text-muted-foreground">
            Nothing confirmed yet — every point you demonstrate shows up here.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
