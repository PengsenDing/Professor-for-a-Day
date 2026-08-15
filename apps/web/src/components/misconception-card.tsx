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
 */
export function MisconceptionCard({
  misconception,
  studentName,
}: {
  misconception: ActiveMisconception | null;
  studentName: string;
}) {
  return (
    <Card className="gap-3 border-0 py-4 shadow-none">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Brain className="size-4 text-muted-foreground" />
          Current misconception
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        {misconception ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 rounded-md border border-amber-300/60 bg-amber-50 p-3 duration-500 dark:border-amber-500/30 dark:bg-amber-500/10">
            <div className="flex items-start gap-2">
              <Quote className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
              <p className="text-sm italic">{misconception.summary}</p>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Repair this belief — an unresolved misconception blocks 100%.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            <EyeOff className="mt-0.5 size-4 shrink-0" />
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
