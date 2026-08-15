import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearGraphLocalState,
  loadGraphArrangement,
  loadMastery,
  recordMastery,
  saveGraphArrangement,
  sessionFromSnapshot,
} from "./session-store";
import type { SessionSnapshot } from "./types";
import { BUILTIN_GRAPH_ID } from "./types";

// session-store guards on `typeof window`, so give the node test runtime a
// minimal window + localStorage pair.
function installFakeStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  (globalThis as Record<string, unknown>).window = { localStorage };
  return store;
}

let store: Map<string, string>;

beforeEach(() => {
  store = installFakeStorage();
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
});

describe("mastery store", () => {
  it("scopes best scores per graph", () => {
    recordMastery("graph-a", "concept", 40);
    recordMastery("graph-b", "concept", 80);

    expect(loadMastery("graph-a")).toEqual({ concept: 40 });
    expect(loadMastery("graph-b")).toEqual({ concept: 80 });
  });

  it("keeps the previous best when a session scores lower", () => {
    recordMastery("graph-a", "concept", 70);
    recordMastery("graph-a", "concept", 30);

    expect(loadMastery("graph-a")).toEqual({ concept: 70 });
  });

  it("migrates the legacy flat map into the builtin graph once", () => {
    store.set("pfad:mastery", JSON.stringify({ "gradient-descent": 60 }));

    expect(loadMastery(BUILTIN_GRAPH_ID)).toEqual({ "gradient-descent": 60 });
    expect(store.has("pfad:mastery")).toBe(false);
    // The migrated value now lives in the v2 store and survives new writes.
    recordMastery(BUILTIN_GRAPH_ID, "overfitting", 20);
    expect(loadMastery(BUILTIN_GRAPH_ID)).toEqual({
      "gradient-descent": 60,
      overfitting: 20,
    });
  });

  it("prefers already-migrated v2 values over the legacy map", () => {
    recordMastery(BUILTIN_GRAPH_ID, "gradient-descent", 90);
    store.set("pfad:mastery", JSON.stringify({ "gradient-descent": 10 }));

    expect(loadMastery(BUILTIN_GRAPH_ID)).toEqual({ "gradient-descent": 90 });
  });

  it("drops corrupt legacy data instead of crashing", () => {
    store.set("pfad:mastery", "{not json");

    expect(loadMastery(BUILTIN_GRAPH_ID)).toEqual({});
    expect(store.has("pfad:mastery")).toBe(false);
  });
});

describe("graph arrangement store", () => {
  it("scopes arrangements per graph", () => {
    saveGraphArrangement("graph-a", { concept: [1, 2, 3] });

    expect(loadGraphArrangement("graph-a")).toEqual({ concept: [1, 2, 3] });
    expect(loadGraphArrangement("graph-b")).toEqual({});
  });

  it("migrates the legacy un-keyed arrangement to the builtin graph", () => {
    store.set("pfad:graph-arrangement", JSON.stringify({ model: [0, 1, 0] }));

    expect(loadGraphArrangement(BUILTIN_GRAPH_ID)).toEqual({ model: [0, 1, 0] });
    expect(store.has("pfad:graph-arrangement")).toBe(false);
    // Another graph never sees the migrated data.
    expect(loadGraphArrangement("graph-a")).toEqual({});
  });

  it("clearGraphLocalState drops one graph's mastery and arrangement only", () => {
    recordMastery("graph-a", "concept", 50);
    recordMastery("graph-b", "concept", 60);
    saveGraphArrangement("graph-a", { concept: [1, 2, 3] });
    saveGraphArrangement("graph-b", { concept: [4, 5, 6] });

    clearGraphLocalState("graph-a");

    expect(loadMastery("graph-a")).toEqual({});
    expect(loadGraphArrangement("graph-a")).toEqual({});
    expect(loadMastery("graph-b")).toEqual({ concept: 60 });
    expect(loadGraphArrangement("graph-b")).toEqual({ concept: [4, 5, 6] });
  });

  it("keeps only well-formed entries", () => {
    saveGraphArrangement("graph-a", {
      good: [1, 2, 3],
    });
    store.set(
      "pfad:graph-arrangement:graph-a",
      JSON.stringify({ good: [1, 2, 3], bad: [1, "x", 3], worse: null }),
    );

    expect(loadGraphArrangement("graph-a")).toEqual({ good: [1, 2, 3] });
  });
});

const SNAPSHOT: SessionSnapshot = {
  session_id: "66bcd1f2a9c4e35d8f01a2b3",
  graph_id: BUILTIN_GRAPH_ID,
  concept: { id: "gradient-descent", title: "Gradient Descent" },
  mode: "confident",
  opening_text: "Gradient descent is just random guessing, right?",
  turns: [
    {
      turn_number: 1,
      learner_transcript: "No — it computes the gradient and steps against it.",
      input_mode: "voice",
      student_text: "But the biggest step must be fastest, no?",
      newly_covered_points: [
        { id: "gd-1", label: "Uses the gradient of the loss" },
        { id: "gd-2", label: "Steps opposite the gradient direction" },
      ],
    },
    {
      turn_number: 2,
      learner_transcript: "Too big a step overshoots and can diverge.",
      input_mode: "text",
      student_text: "Ah, overshooting. What controls the step size then?",
      newly_covered_points: [
        // gd-2 repeated: the client-side accumulation must dedupe by id.
        { id: "gd-2", label: "Steps opposite the gradient direction" },
        { id: "gd-3", label: "Learning rate controls the step size" },
      ],
    },
  ],
  progress: { percent: 75 },
  active_misconception: null,
  learner_turn_count: 2,
  turns_remaining: 6,
  status: "active",
  end_reason: null,
  report: null,
  graph_update: null,
  created_at: "2026-08-15T09:30:00Z",
};

describe("sessionFromSnapshot", () => {
  it("rebuilds the conversation in order with speech turn numbers", () => {
    const session = sessionFromSnapshot(SNAPSHOT);

    expect(session.messages.map((m) => m.role)).toEqual([
      "student",
      "learner",
      "student",
      "learner",
      "student",
    ]);
    // Student messages carry the turn number used by the speech endpoint.
    expect(session.messages[0]).toMatchObject({
      text: SNAPSHOT.opening_text,
      turn_number: 0,
    });
    expect(session.messages[2].turn_number).toBe(1);
    expect(session.messages[4].turn_number).toBe(2);
    // Learner messages keep their transcript and input mode.
    expect(session.messages[1]).toMatchObject({
      text: SNAPSHOT.turns[0].learner_transcript,
      input_mode: "voice",
    });
    expect(session.messages[3].input_mode).toBe("text");
  });

  it("accumulates covered points across turns without duplicates", () => {
    const session = sessionFromSnapshot(SNAPSHOT);
    expect(session.covered_points.map((p) => p.id)).toEqual([
      "gd-1",
      "gd-2",
      "gd-3",
    ]);
  });

  it("carries session-level state through unchanged", () => {
    const session = sessionFromSnapshot(SNAPSHOT);
    expect(session).toMatchObject({
      session_id: SNAPSHOT.session_id,
      graph_id: BUILTIN_GRAPH_ID,
      concept: SNAPSHOT.concept,
      mode: "confident",
      progress: { percent: 75 },
      learner_turn_count: 2,
      turns_remaining: 6,
      status: "active",
      end_reason: null,
      active_misconception: null,
      report: null,
      graph_update: null,
      created_at: "2026-08-15T09:30:00Z",
    });
  });

  it("preserves an ended session's report and end reason", () => {
    const ended = sessionFromSnapshot({
      ...SNAPSHOT,
      status: "ended",
      end_reason: "learner_finished",
      report: {
        final_percent: 75,
        explained_well: ["Explained the gradient."],
        misconceptions_corrected: [],
        gaps_and_accidental_implications: [],
        improvement_suggestion: "Add a worked example.",
        recommended_next_concept: { id: "learning-rate", title: "Learning Rate" },
        mastery_achieved: false,
      },
    });
    expect(ended.status).toBe("ended");
    expect(ended.end_reason).toBe("learner_finished");
    expect(ended.report?.final_percent).toBe(75);
  });

  it("carries a freeform session's graph fields through", () => {
    const freeform = sessionFromSnapshot({
      ...SNAPSHOT,
      graph_id: "66bcd1f2a9c4e35d8f01a2b4",
      graph_update: {
        graph_id: "66bcd1f2a9c4e35d8f01a2b4",
        graph_title: "Compilers",
        created: true,
        added_concepts: [{ id: "parsing", title: "Parsing" }],
      },
    });
    expect(freeform.graph_id).toBe("66bcd1f2a9c4e35d8f01a2b4");
    expect(freeform.graph_update?.created).toBe(true);
  });
});
