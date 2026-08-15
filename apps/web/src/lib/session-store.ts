// Browser-local persistence. The contract has no session-read endpoint, so
// the running conversation lives here; Mastery (best score per Concept) is
// browser-local by design and appears nowhere in the contract (mvp-spec.md).

import type {
  ChatMessage,
  SessionCreated,
  SessionFinished,
  StoredSession,
  TurnEnvelope,
} from "./types";

const SESSIONS_KEY = "pfad:sessions";
const MASTERY_KEY = "pfad:mastery";

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

export function applyTurn(
  session: StoredSession,
  envelope: TurnEnvelope,
): StoredSession {
  const learnerMessage: ChatMessage = {
    id: crypto.randomUUID(),
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
