// TypeScript mirrors of the API contract in packages/shared/openapi.yaml.
// That file is the authoritative agreement between frontend and backend
// (docs/adr/0001-openapi-is-the-product-api-contract.md) — keep in sync.

// ---------------------------------------------------------------------------
// Wire types (packages/shared/openapi.yaml components/schemas)

export type Mode = "beginner" | "confident" | "skeptic";
export type InputMode = "text" | "voice";
export type SessionStatus = "active" | "ended";
export type EndReason = "mastery" | "learner_finished" | "turn_limit";

export interface Concept {
  id: string;
  title: string;
  summary: string;
}

export interface ConceptRef {
  id: string;
  title: string;
}

export interface PrerequisiteEdge {
  from: string;
  to: string;
}

export interface Curriculum {
  concepts: Concept[];
  edges: PrerequisiteEdge[];
}

export type GraphSource = "builtin" | "user";

export interface GraphSummary {
  id: string;
  title: string;
  source: GraphSource;
  concept_count: number;
  /** Null for the builtin graph, which predates the database. */
  created_at: string | null;
}

export interface GraphList {
  graphs: GraphSummary[];
}

/** What a finished session did to a knowledge graph (null for builtin sessions). */
export interface GraphUpdate {
  graph_id: string;
  graph_title: string;
  /** True when this session created the graph; false when it grew one. */
  created: boolean;
  /** All concepts of a new graph; only the appended ones for a grown graph. */
  added_concepts: ConceptRef[];
}

export interface Progress {
  /** 0–100. Monotonic within a session; capped at 99 while a misconception challenge is unposed or unresolved. */
  percent: number;
}

export interface RubricPointRef {
  id: string;
  label: string;
}

export interface ActiveMisconception {
  id: string;
  summary: string;
}

/** Exactly one of (`graph_id` + `concept_id`) or `topic` must be provided. */
export interface StartSessionRequest {
  graph_id?: string;
  concept_id?: string;
  /** Freeform subject to teach; the session's graph is created at session end. */
  topic?: string;
  mode: Mode;
}

export interface SessionCreated {
  session_id: string;
  /** Null for a topic session until its graph is created at session end. */
  graph_id: string | null;
  concept: ConceptRef;
  mode: Mode;
  /** The AI Student's opening question — turn 0 for the speech endpoint. */
  student_text: string;
  progress: Progress;
  learner_turn_count: 0;
  turns_remaining: 8;
  status: "active";
  active_misconception: null;
}

export interface SubmitTurnRequest {
  learner_text: string;
  input_mode: InputMode;
  /** Client-generated idempotency key. Retries MUST reuse the same value. */
  client_turn_id: string;
}

export interface TurnEnvelope {
  turn_number: number;
  learner_transcript: string;
  student_text: string;
  progress: Progress;
  newly_covered_points: RubricPointRef[];
  active_misconception: ActiveMisconception | null;
  learner_turn_count: number;
  turns_remaining: number;
  status: SessionStatus;
  end_reason: EndReason | null;
  report: TeacherReport | null;
  graph_update: GraphUpdate | null;
}

export interface SnapshotTurn {
  turn_number: number;
  learner_transcript: string;
  input_mode: InputMode;
  student_text: string;
  newly_covered_points: RubricPointRef[];
}

/**
 * GET /api/sessions/{session_id} — learner-safe read model of a stored
 * session (ADR-0004). Judge evaluations and rubric internals never appear.
 */
export interface SessionSnapshot {
  session_id: string;
  /** Null for a topic session whose graph does not exist yet. */
  graph_id: string | null;
  concept: ConceptRef;
  mode: Mode;
  /** The AI Student's opening question — turn 0 for the speech endpoint. */
  opening_text: string;
  turns: SnapshotTurn[];
  progress: Progress;
  active_misconception: ActiveMisconception | null;
  learner_turn_count: number;
  turns_remaining: number;
  status: SessionStatus;
  end_reason: EndReason | null;
  report: TeacherReport | null;
  /** Same semantics as on TurnEnvelope; replayed from storage. */
  graph_update: GraphUpdate | null;
  created_at: string;
}

export interface SessionFinished {
  session_id: string;
  status: "ended";
  end_reason: EndReason;
  progress: Progress;
  report: TeacherReport;
  graph_update: GraphUpdate | null;
}

/**
 * Why one rubric point was scored. `quote` is the learner's own words —
 * surfaced only when the Judge's evidence was verbatim — or null.
 */
export interface DemonstratedEvidence {
  point: RubricPointRef;
  quote: string | null;
  turn_number: number;
}

export interface TeacherReport {
  final_percent: number;
  explained_well: string[];
  /** One entry per confirmed point, in rubric order. Absent in reports stored before this field existed. */
  evidence?: DemonstratedEvidence[];
  misconceptions_corrected: string[];
  gaps_and_accidental_implications: string[];
  improvement_suggestion: string;
  /** Null when the graph has no other concept to recommend. */
  recommended_next_concept: ConceptRef | null;
  mastery_achieved: boolean;
}

export interface Transcription {
  transcript: string;
}

export interface Health {
  ok: boolean;
  model: string;
  database: "up" | "down";
}

export type ErrorCode =
  | "INVALID_GRAPH"
  | "INVALID_CONCEPT"
  | "INVALID_MODE"
  | "EMPTY_SUBMISSION"
  | "GRAPH_NOT_FOUND"
  | "GRAPH_NOT_DELETABLE"
  | "SESSION_NOT_FOUND"
  | "TURN_NOT_FOUND"
  | "SESSION_ENDED"
  | "TRANSCRIPTION_FAILED"
  | "GENERATION_FAILED"
  | "SPEECH_FAILED"
  | "UPLOAD_TOO_LARGE"
  | "UNSUPPORTED_AUDIO_TYPE"
  | "DB_UNAVAILABLE"
  | "VALIDATION_FAILED";

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
  };
}

// ---------------------------------------------------------------------------
// UI-only types (never sent over the wire)

export interface ChatMessage {
  id: string;
  role: "learner" | "student";
  text: string;
  /** Student messages only: the turn number used by the speech endpoint (0 = opening question). */
  turn_number?: number;
  input_mode?: InputMode;
}

/**
 * Client-held session state. localStorage-first: the running conversation
 * lives here, and GET /api/sessions/{id} (ADR-0004) is the fallback when this
 * browser has no copy (cleared storage, or a link from another device).
 */
export interface StoredSession {
  session_id: string;
  /** Null for a freeform session until its graph is created at session end. */
  graph_id: string | null;
  concept: ConceptRef;
  mode: Mode;
  messages: ChatMessage[];
  progress: Progress;
  learner_turn_count: number;
  turns_remaining: number;
  status: SessionStatus;
  end_reason: EndReason | null;
  active_misconception: ActiveMisconception | null;
  /** Rubric points confirmed so far this session (accumulated from turn envelopes). */
  covered_points: RubricPointRef[];
  report: TeacherReport | null;
  /** Set when the session ended and created/grew a knowledge graph. */
  graph_update: GraphUpdate | null;
  created_at: string;
}

export const MODES: Record<
  Mode,
  { name: string; label: string; description: string }
> = {
  beginner: {
    name: "Lily",
    label: "Beginner",
    description:
      "Asks foundational questions and makes simple mistakes. Great for a first pass.",
  },
  confident: {
    name: "Max",
    label: "Confident",
    description:
      "Partially understands — and asserts plausible but wrong conclusions you must correct.",
  },
  skeptic: {
    name: "Sokrates",
    label: "Skeptic",
    description:
      "Challenges your assumptions, causal claims, counterexamples, and edge cases.",
  },
};

/** Stable UI ids for the three students (used by the picker's onSelect). */
export const STUDENT_IDS: Record<Mode, string> = {
  beginner: "lily",
  confident: "max",
  skeptic: "sokrates",
};

export const MODE_BY_STUDENT_ID: Record<string, Mode> = Object.fromEntries(
  (Object.entries(STUDENT_IDS) as [Mode, string][]).map(([mode, id]) => [
    id,
    mode,
  ]),
);

/** Contract limit on learner_text (SubmitTurnRequest.maxLength). */
export const MAX_LEARNER_TEXT_LENGTH = 8000;
/** Contract limit on a freeform topic (StartSessionRequest.topic.maxLength). */
export const MAX_TOPIC_LENGTH = 200;
/** Sessions end after this many accepted learner turns. */
export const MAX_LEARNER_TURNS = 8;
/** The version-controlled Machine Learning graph (ADR-0002). */
export const BUILTIN_GRAPH_ID = "machine-learning";
