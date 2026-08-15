// Turns one accepted turn envelope into the "gain chips" the session page
// celebrates with (progress-gain-chips.tsx): one chip per newly confirmed
// rubric point, plus one when the turn cleared the active misconception.
// Each chip carries the percent the progress bar should show once it merges,
// staged so the bar climbs chip by chip and the last chip lands exactly on
// the envelope's percent.

import type { ActiveMisconception, TurnEnvelope } from "./types";

export interface GainChip {
  /** Unique per chip instance; turn-scoped so replays of a point stay distinct. */
  key: string;
  kind: "point" | "misconception";
  /** Learner-safe text: the point's label, or the cleared misconception's summary. */
  label: string;
  /** What the progress bar should display after this chip has merged into it. */
  percentAfter: number;
}

export function buildGainChips(
  envelope: TurnEnvelope,
  previousPercent: number,
  previousMisconception: ActiveMisconception | null,
): GainChip[] {
  // The active misconception is the oldest unresolved one, so it changing id
  // (or clearing entirely) means the previously shown challenge was resolved.
  const cleared =
    previousMisconception !== null &&
    envelope.active_misconception?.id !== previousMisconception.id;

  const points = envelope.newly_covered_points;
  const total = points.length + (cleared ? 1 : 0);
  if (total === 0) return [];

  const target = envelope.progress.percent;
  const span = target - previousPercent;
  const chips: GainChip[] = points.map((point, index) => ({
    key: `${envelope.turn_number}:${point.id}`,
    kind: "point",
    label: point.label,
    percentAfter: Math.round(previousPercent + (span * (index + 1)) / total),
  }));
  if (cleared) {
    chips.push({
      key: `${envelope.turn_number}:misconception:${previousMisconception.id}`,
      kind: "misconception",
      label: previousMisconception.summary,
      percentAfter: target,
    });
  }
  chips[chips.length - 1].percentAfter = target;
  return chips;
}
