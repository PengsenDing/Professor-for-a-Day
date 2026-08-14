import { MessageCircleQuestion, Sprout, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Mode } from "@/lib/types";
import { cn } from "@/lib/utils";

export const MODE_ICONS: Record<Mode, LucideIcon> = {
  beginner: Sprout,
  confident: Zap,
  skeptic: MessageCircleQuestion,
};

export function ModeAvatar({
  mode,
  className,
}: {
  mode: Mode;
  className?: string;
}) {
  const Icon = MODE_ICONS[mode];
  return (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-4" />
    </div>
  );
}
