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
  StoredSession,
  TurnEnvelope,
} from "./types";

const SESSIONS_KEY = "pfad:sessions";
const MASTERY_KEY = "pfad:mastery";
const GRAPH_ARRANGEMENT_KEY = "pfad:graph-arrangement";
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
  return loadAll()[sessionId] ?? null;
}

/** Sessions this browser still believes are active (candidates for finish-on-abandon). */
export function loadActiveStoredSessions(): StoredSession[] {
  return Object.values(loadAll()).filter((s) => s.status === "active");
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
    concept: created.concept,
    mode: created.mode,
    messages: [opening],
    progress: created.progress,
    learner_turn_count: created.learner_turn_count,
    turns_remaining: created.turns_remaining,
    status: created.status,
    end_reason: null,
    active_misconception: created.active_misconception,
    covered_points: [],
    report: null,
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
    concept: snapshot.concept,
    mode: snapshot.mode,
    messages,
    progress: snapshot.progress,
    learner_turn_count: snapshot.learner_turn_count,
    turns_remaining: snapshot.turns_remaining,
    status: snapshot.status,
    end_reason: snapshot.end_reason,
    active_misconception: snapshot.active_misconception,
    covered_points: covered,
    report: snapshot.report,
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
  return {
    ...session,
    messages: [...session.messages, learnerMessage, studentMessage],
    progress: envelope.progress,
    learner_turn_count: envelope.learner_turn_count,
    turns_remaining: envelope.turns_remaining,
    status: envelope.status,
    end_reason: envelope.end_reason,
    active_misconception: envelope.active_misconception,
    covered_points: [
      ...session.covered_points,
      ...envelope.newly_covered_points.filter((p) => !knownIds.has(p.id)),
    ],
    report: envelope.report,
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
// Mastery (best score per Concept, updated only when a session improves it)

export function loadMastery(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(MASTERY_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** Records a session's progress (per turn or final); keeps the previous best if higher. */
export function recordMastery(conceptId: string, percent: number) {
  const mastery = loadMastery();
  if (percent > (mastery[conceptId] ?? 0)) {
    mastery[conceptId] = percent;
    window.localStorage.setItem(MASTERY_KEY, JSON.stringify(mastery));
  }
}

// ---------------------------------------------------------------------------
// Knowledge-graph arrangement (where the learner last dragged the balls)

/** World-space ball centers by concept id, as last arranged by the learner. */
export type GraphArrangement = Record<string, [number, number, number]>;

export function loadGraphArrangement(): GraphArrangement {
  if (typeof window === "undefined") return {};
  try {
    const raw: unknown = JSON.parse(
      window.localStorage.getItem(GRAPH_ARRANGEMENT_KEY) ?? "{}",
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

export function saveGraphArrangement(arrangement: GraphArrangement) {
  window.localStorage.setItem(
    GRAPH_ARRANGEMENT_KEY,
    JSON.stringify(arrangement),
  );
}
