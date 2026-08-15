import { Brain, EyeOff, Quote } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ActiveMisconception } from "@/lib/types";

/**
 * Shows the misunderstanding the learner is currently trying to repair —
 * the backend surfaces it (learner-safe) once the AI Student poses it.
 * Rendered frameless (no border, transparent card) inside the insight
 * sphere's blur-backdrop panel; the amber tint alone marks the belief.
 */
export function MisconceptionCard({
  misconception,
  studentName,
}: {
  misconception: ActiveMisconception | null;
  studentName: string;
}) {
  return (
    <Card className="gap-4 border-0 bg-transparent py-6 shadow-none">
      <CardHeader className="px-6">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <Brain className="size-5 text-muted-foreground" />
          Current misconception
        </CardTitle>
      </CardHeader>
      <CardContent className="px-6">
        {misconception ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 rounded-2xl bg-amber-100/70 p-4 duration-500 dark:bg-amber-500/10">
            <div className="flex items-start gap-2.5">
              <Quote className="mt-1 size-4 shrink-0 text-amber-600" />
              <p className="text-base italic">{misconception.summary}</p>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Repair this belief — an unresolved misconception blocks 100%.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2.5 rounded-2xl bg-muted/60 p-4 text-base text-muted-foreground">
            <EyeOff className="mt-1 size-5 shrink-0" />
            <p>
              No open misconception — but listen closely to what {studentName}{" "}
              concludes next…
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
