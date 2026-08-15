// Browser-local persistence, localStorage-first: the running conversation
// lives here, with GET /api/sessions/{id} (ADR-0004) as the fallback when
// this browser has no copy. Mastery (best score per Concept) is browser-local
// by design and appears nowhere in the contract (mvp-spec.md).

import type {
  ChatMessage,
  RubricPointRef,
  SessionCreated,
  SessionFinished,
  SessionSnapshot,
  StartSessionRequest,
  StoredSession,
  TurnEnvelope,
} from "./types";
import { BUILTIN_GRAPH_ID } from "./types";

const SESSIONS_KEY = "pfad:sessions";
const MASTERY_KEY = "pfad:mastery-v2";
/** Pre-multi-graph flat map; migrated once into the builtin graph's slot. */
const LEGACY_MASTERY_KEY = "pfad:mastery";
const GRAPH_ARRANGEMENT_KEY_PREFIX = "pfad:graph-arrangement:";
/** Pre-multi-graph arrangement; migrated once to the builtin graph's key. */
const LEGACY_GRAPH_ARRANGEMENT_KEY = "pfad:graph-arrangement";
const FRESH_SESSION_KEY = "pfad:fresh-session";

// ---------------------------------------------------------------------------
// Session snapshots

function loadAll(): Record<string, StoredSession> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(SESSIONS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveAll(sessions: Record<string, StoredSession>) {
  window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function loadStoredSession(sessionId: string): StoredSession | null {
  const stored = loadAll()[sessionId];
  if (!stored) return null;
  // Sessions stored before multi-graph support have no graph fields. They all
  // belonged to the builtin graph; `null` is reserved for freeform sessions.
  return {
    ...stored,
    graph_id: stored.graph_id === undefined ? BUILTIN_GRAPH_ID : stored.graph_id,
    graph_update: stored.graph_update ?? null,
  };
}

/** Sessions this browser still believes are active (candidates for finish-on-abandon). */
export function loadActiveStoredSessions(): StoredSession[] {
  return Object.values(loadAll()).filter((s) => s.status === "active");
}

/**
 * The most recent still-active session this browser holds for one concept,
 * or null. Lets the graph page resume an unfinished session — with its chat
 * history — instead of silently starting a new one (ADR-0004).
 */
export function findActiveSession(
  graphId: string,
  conceptId: string,
): StoredSession | null {
  const matches = Object.keys(loadAll())
    .map((id) => loadStoredSession(id)) // normalizes legacy graph fields
    .filter((s): s is StoredSession => s !== null)
    .filter(
      (s) =>
        s.status === "active" &&
        s.graph_id === graphId &&
        s.concept.id === conceptId,
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return matches[0] ?? null;
}

export function saveStoredSession(session: StoredSession) {
  const all = loadAll();
  all[session.session_id] = session;
  saveAll(all);
}

export function sessionFromCreated(created: SessionCreated): StoredSession {
  const opening: ChatMessage = {
    id: crypto.randomUUID(),
    role: "student",
    text: created.student_text,
    turn_number: 0,
  };
  return {
    session_id: created.session_id,
    graph_id: created.graph_id,
    concept: created.concept,
    mode: created.mode,
    messages: [opening],
    progress: created.progress,
    learner_turn_count: created.learner_turn_count,
    status: created.status,
    end_reason: null,
    active_misconception: created.active_misconception,
    covered_points: [],
    report: null,
    graph_update: null,
    created_at: new Date().toISOString(),
  };
}

/**
 * Rebuild a StoredSession from the server's learner-safe snapshot (ADR-0004).
 * Used when this browser has no local copy; downstream code then works
 * against the same local store as an ordinary refresh.
 */
export function sessionFromSnapshot(snapshot: SessionSnapshot): StoredSession {
  const messages: ChatMessage[] = [
    {
      id: crypto.randomUUID(),
      role: "student",
      text: snapshot.opening_text,
      turn_number: 0,
    },
  ];
  const covered: RubricPointRef[] = [];
  const knownIds = new Set<string>();
  for (const turn of snapshot.turns) {
    messages.push({
      id: crypto.randomUUID(),
      role: "learner",
      text: turn.learner_transcript,
      input_mode: turn.input_mode,
    });
    messages.push({
      id: crypto.randomUUID(),
      role: "student",
      text: turn.student_text,
      turn_number: turn.turn_number,
    });
    for (const point of turn.newly_covered_points) {
      if (!knownIds.has(point.id)) {
        knownIds.add(point.id);
        covered.push(point);
      }
    }
  }
  return {
    session_id: snapshot.session_id,
    graph_id: snapshot.graph_id,
    concept: snapshot.concept,
    mode: snapshot.mode,
    messages,
    progress: snapshot.progress,
    learner_turn_count: snapshot.learner_turn_count,
    status: snapshot.status,
    end_reason: snapshot.end_reason,
    active_misconception: snapshot.active_misconception,
    covered_points: covered,
    report: snapshot.report,
    graph_update: snapshot.graph_update,
    created_at: snapshot.created_at,
  };
}

export function applyTurn(
  session: StoredSession,
  envelope: TurnEnvelope,
  // The turn's client_turn_id, so the optimistic pending bubble and the
  // confirmed message share one identity (a running reveal never restarts).
  learnerMessageId?: string,
): StoredSession {
  const learnerMessage: ChatMessage = {
    id: learnerMessageId ?? crypto.randomUUID(),
    role: "learner",
    text: envelope.learner_transcript,
  };
  const studentMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "student",
    text: envelope.student_text,
    turn_number: envelope.turn_number,
  };
  const knownIds = new Set(session.covered_points.map((p) => p.id));
  const graphUpdate = envelope.graph_update ?? session.graph_update;
  return {
    ...session,
    messages: [...session.messages, learnerMessage, studentMessage],
    progress: envelope.progress,
    learner_turn_count: envelope.learner_turn_count,
    status: envelope.status,
    end_reason: envelope.end_reason,
    active_misconception: envelope.active_misconception,
    covered_points: [
      ...session.covered_points,
      ...envelope.newly_covered_points.filter((p) => !knownIds.has(p.id)),
    ],
    report: envelope.report,
    graph_update: graphUpdate,
    // A freeform session belongs to the graph it just created.
    graph_id:
      envelope.graph_update?.created === true
        ? envelope.graph_update.graph_id
        : session.graph_id,
  };
}

export function applyFinished(
  session: StoredSession,
  finished: SessionFinished,
): StoredSession {
  return {
    ...session,
    progress: finished.progress,
    status: finished.status,
    end_reason: finished.end_reason,
    report: finished.report,
    graph_update: finished.graph_update ?? session.graph_update,
    graph_id:
      finished.graph_update?.created === true
        ? finished.graph_update.graph_id
        : session.graph_id,
  };
}

// ---------------------------------------------------------------------------
// Pending start: clicking "start teaching" stashes the start request here and
// navigates to /session/new immediately, so the learner waits for the opening
// question inside the session view instead of on the setup page. Kept in
// sessionStorage on purpose — a refresh mid-creation just fires the request
// again (finishSession's abandoned-session sweep tolerates the rare orphan).

/** A start request handed from a setup page to the session page. */
export interface PendingStart {
  request: StartSessionRequest;
  /** Shown in the session header until the server names the concept. */
  concept_title: string;
}

const PENDING_START_KEY = "pfad:pending-start";

export function stashPendingStart(pending: PendingStart) {
  window.sessionStorage.setItem(PENDING_START_KEY, JSON.stringify(pending));
}

export function loadPendingStart(): PendingStart | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_START_KEY);
    return raw ? (JSON.parse(raw) as PendingStart) : null;
  } catch {
    return null;
  }
}

export function clearPendingStart() {
  try {
    window.sessionStorage.removeItem(PENDING_START_KEY);
  } catch {
    // Storage unavailable: nothing was stashed either.
  }
}

/**
 * A renderable stand-in for the session view while the opening question is
 * still being generated. Never persisted; replaced wholesale by the real
 * StoredSession the moment SessionCreated arrives.
 */
export function placeholderFromPending(pending: PendingStart): StoredSession {
  return {
    session_id: "",
    graph_id: pending.request.graph_id ?? null,
    concept: {
      id: pending.request.concept_id ?? "",
      title: pending.concept_title,
    },
    mode: pending.request.mode,
    messages: [],
    progress: { percent: 0 },
    learner_turn_count: 0,
    status: "active",
    end_reason: null,
    active_misconception: null,
    covered_points: [],
    report: null,
    graph_update: null,
    created_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Fresh-session marker: sessions load from localStorage, so the opening
// question is already stored before the session page ever mounts. This
// one-shot sessionStorage flag is how the page tells a brand-new session
// (animate + speak the opening question once) apart from a refresh (don't).

export function markFreshSession(sessionId: string) {
  try {
    window.sessionStorage.setItem(FRESH_SESSION_KEY, sessionId);
  } catch {
    // Storage unavailable: the opening question simply renders instantly.
  }
}

/** True exactly once per fresh session; consuming clears the marker. */
export function consumeFreshSession(sessionId: string): boolean {
  try {
    const fresh = window.sessionStorage.getItem(FRESH_SESSION_KEY) === sessionId;
    if (fresh) window.sessionStorage.removeItem(FRESH_SESSION_KEY);
    return fresh;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Mastery (best score per Concept per graph, updated only when a session
// improves it). Stored as { graphId: { conceptId: percent } }.

type MasteryStore = Record<string, Record<string, number>>;

function loadMasteryStore(): MasteryStore {
  if (typeof window === "undefined") return {};
  try {
    const store: MasteryStore = JSON.parse(
      window.localStorage.getItem(MASTERY_KEY) ?? "{}",
    );
    // One-time migration: the flat pre-multi-graph map was all Machine Learning.
    const legacy = window.localStorage.getItem(LEGACY_MASTERY_KEY);
    if (legacy !== null) {
      try {
        const flat: Record<string, number> = JSON.parse(legacy);
        const builtin = { ...flat, ...(store[BUILTIN_GRAPH_ID] ?? {}) };
        store[BUILTIN_GRAPH_ID] = builtin;
        window.localStorage.setItem(MASTERY_KEY, JSON.stringify(store));
      } catch {
        // Corrupt legacy data: drop it rather than crash.
      }
      window.localStorage.removeItem(LEGACY_MASTERY_KEY);
    }
    return store;
  } catch {
    return {};
  }
}

export function loadMastery(graphId: string): Record<string, number> {
  return loadMasteryStore()[graphId] ?? {};
}

/** Records a session's progress (per turn or final); keeps the previous best if higher. */
export function recordMastery(graphId: string, conceptId: string, percent: number) {
  const store = loadMasteryStore();
  const mastery = store[graphId] ?? {};
  if (percent > (mastery[conceptId] ?? 0)) {
    mastery[conceptId] = percent;
    store[graphId] = mastery;
    window.localStorage.setItem(MASTERY_KEY, JSON.stringify(store));
  }
}

/** Drop everything browser-local about one graph (after the server deleted it). */
export function clearGraphLocalState(graphId: string) {
  const store = loadMasteryStore();
  if (graphId in store) {
    delete store[graphId];
    window.localStorage.setItem(MASTERY_KEY, JSON.stringify(store));
  }
  window.localStorage.removeItem(arrangementKey(graphId));
}

// ---------------------------------------------------------------------------
// Knowledge-graph arrangement (where the learner last dragged the balls)

/** World-space ball centers by concept id, as last arranged by the learner. */
export type GraphArrangement = Record<string, [number, number, number]>;

function arrangementKey(graphId: string): string {
  return `${GRAPH_ARRANGEMENT_KEY_PREFIX}${graphId}`;
}

export function loadGraphArrangement(graphId: string): GraphArrangement {
  if (typeof window === "undefined") return {};
  try {
    // One-time migration: the un-keyed arrangement belonged to the ML graph.
    const legacy = window.localStorage.getItem(LEGACY_GRAPH_ARRANGEMENT_KEY);
    if (legacy !== null) {
      if (window.localStorage.getItem(arrangementKey(BUILTIN_GRAPH_ID)) === null) {
        window.localStorage.setItem(arrangementKey(BUILTIN_GRAPH_ID), legacy);
      }
      window.localStorage.removeItem(LEGACY_GRAPH_ARRANGEMENT_KEY);
    }

    const raw: unknown = JSON.parse(
      window.localStorage.getItem(arrangementKey(graphId)) ?? "{}",
    );
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return {};
    }
    // Keep only well-formed entries so a corrupt store degrades per ball
    // (back to the computed layout), never into a crash.
    const arrangement: GraphArrangement = {};
    for (const [id, value] of Object.entries(raw)) {
      if (
        Array.isArray(value) &&
        value.length === 3 &&
        value.every((n) => typeof n === "number" && Number.isFinite(n))
      ) {
        arrangement[id] = value as [number, number, number];
      }
    }
    return arrangement;
  } catch {
    return {};
  }
}

export function saveGraphArrangement(
  graphId: string,
  arrangement: GraphArrangement,
) {
  window.localStorage.setItem(
    arrangementKey(graphId),
    JSON.stringify(arrangement),
  );
}
