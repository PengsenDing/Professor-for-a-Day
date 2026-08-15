import { describe, expect, it } from "vitest";
import { buildGainChips } from "./progress-gain";
import type { TurnEnvelope } from "./types";

function envelope(overrides: Partial<TurnEnvelope>): TurnEnvelope {
  return {
    turn_number: 3,
    learner_transcript: "The learning rate scales each step.",
    student_text: "So a bigger rate always converges faster?",
    progress: { percent: 75 },
    newly_covered_points: [],
    active_misconception: null,
    learner_turn_count: 3,
    status: "active",
    end_reason: null,
    report: null,
    graph_update: null,
    ...overrides,
  };
}

describe("buildGainChips", () => {
  it("returns nothing when the turn confirmed nothing", () => {
    expect(buildGainChips(envelope({ progress: { percent: 50 } }), 50, null)).toEqual([]);
  });

  it("stages one chip per newly covered point, ending exactly on the envelope percent", () => {
    const chips = buildGainChips(
      envelope({
        progress: { percent: 75 },
        newly_covered_points: [
          { id: "gd-2", label: "Steps opposite the gradient" },
          { id: "gd-3", label: "Learning rate controls the step size" },
        ],
      }),
      25,
      null,
    );

    expect(chips.map((c) => c.kind)).toEqual(["point", "point"]);
    expect(chips.map((c) => c.label)).toEqual([
      "Steps opposite the gradient",
      "Learning rate controls the step size",
    ]);
    // The bar climbs chip by chip and the last chip lands on the new percent.
    expect(chips.map((c) => c.percentAfter)).toEqual([50, 75]);
  });

  it("adds a misconception chip when the active misconception was resolved", () => {
    const chips = buildGainChips(
      envelope({ progress: { percent: 100 }, active_misconception: null }),
      99,
      { id: "gd-m1", summary: "Bigger steps always converge faster" },
    );

    expect(chips).toEqual([
      {
        key: "3:misconception:gd-m1",
        kind: "misconception",
        label: "Bigger steps always converge faster",
        percentAfter: 100,
      },
    ]);
  });

  it("treats a changed misconception id as the previous one being cleared", () => {
    const chips = buildGainChips(
      envelope({
        progress: { percent: 60 },
        active_misconception: { id: "gd-m2", summary: "A newly posed mix-up" },
      }),
      60,
      { id: "gd-m1", summary: "The old mix-up" },
    );

    expect(chips.map((c) => c.kind)).toEqual(["misconception"]);
    expect(chips[0].label).toBe("The old mix-up");
  });

  it("keeps the same unresolved misconception silent", () => {
    const active = { id: "gd-m1", summary: "Still unresolved" };
    expect(
      buildGainChips(envelope({ active_misconception: active }), 75, active),
    ).toEqual([]);
  });

  it("orders point chips before the misconception chip and shares the span", () => {
    const chips = buildGainChips(
      envelope({
        progress: { percent: 100 },
        newly_covered_points: [{ id: "gd-4", label: "Convergence criteria" }],
        active_misconception: null,
      }),
      75,
      { id: "gd-m1", summary: "Cleared this turn" },
    );

    expect(chips.map((c) => c.kind)).toEqual(["point", "misconception"]);
    expect(chips.map((c) => c.percentAfter)).toEqual([88, 100]);
  });
});
