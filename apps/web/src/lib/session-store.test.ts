import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearGraphLocalState,
  loadGraphArrangement,
  loadMastery,
  recordMastery,
  saveGraphArrangement,
} from "./session-store";
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
