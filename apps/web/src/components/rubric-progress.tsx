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
 */
export function RubricProgress({ points }: { points: RubricPointRef[] }) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <ListChecks className="size-4 text-muted-foreground" />
          Points you&apos;ve demonstrated
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        {points.length > 0 ? (
          <ul className="space-y-1.5">
            {points.map((point) => (
              <li
                key={point.id}
                className="flex items-start gap-2 rounded-md px-2 py-1 text-sm animate-in fade-in slide-in-from-bottom-1 duration-500"
              >
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                {point.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing confirmed yet — every point you demonstrate shows up here.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
