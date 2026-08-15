// Deterministic mock backend implementing the packages/shared/openapi.yaml
// contract so the frontend is fully usable before the FastAPI backend is.
// Sessions persist in localStorage. Gradient Descent follows the spec's
// golden-path script; other concepts use a generic rubric.
// Swap to the real API via NEXT_PUBLIC_API_MODE=real.

import { ApiError } from "./errors";
import type {
  Concept,
  Curriculum,
  DemonstratedEvidence,
  EndReason,
  GraphList,
  GraphUpdate,
  Mode,
  PrerequisiteEdge,
  RubricPointRef,
  SessionCreated,
  SessionFinished,
  SessionSnapshot,
  StartSessionRequest,
  SubmitTurnRequest,
  TeacherReport,
  Transcription,
  TurnEnvelope,
} from "./types";
import {
  BUILTIN_GRAPH_ID,
  MAX_LEARNER_TEXT_LENGTH,
  MAX_TOPIC_LENGTH,
  MODES,
} from "./types";

const STORAGE_KEY = "pfad:mock-sessions";
const GRAPHS_KEY = "pfad:mock-graphs";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Curriculum (mirrors the contract's /api/curriculum example)

const CURRICULUM: Curriculum = {
  concepts: [
    { id: "dataset", title: "Dataset", summary: "A collection of examples used to teach or evaluate a model." },
    { id: "features-and-labels", title: "Features and Labels", summary: "The inputs a model sees and the answers it learns to predict." },
    { id: "model", title: "Model", summary: "A function with learnable parameters that maps features to predictions." },
    { id: "training-vs-inference", title: "Training vs. Inference", summary: "Learning parameters from data versus using them to predict." },
    { id: "supervised-learning", title: "Supervised Learning", summary: "Learning from examples that include the correct answer." },
    { id: "unsupervised-learning", title: "Unsupervised Learning", summary: "Finding structure in data without labeled answers." },
    { id: "neural-networks", title: "Neural Networks", summary: "Layered models that learn hierarchical representations." },
    { id: "loss-function", title: "Loss Function", summary: "A number that measures how wrong the model's predictions are." },
    { id: "gradient-descent", title: "Gradient Descent", summary: "Iteratively adjusting parameters downhill along the loss gradient." },
    { id: "learning-rate", title: "Learning Rate", summary: "The step size taken on each gradient descent update." },
    { id: "overfitting", title: "Overfitting", summary: "Memorizing training data at the cost of generalization." },
    { id: "regularization", title: "Regularization", summary: "Techniques that penalize complexity to improve generalization." },
    { id: "train-validation-test-split", title: "Train/Validation/Test Split", summary: "Separating data to train, tune, and honestly evaluate." },
    { id: "confusion-matrix", title: "Confusion Matrix", summary: "A table of prediction outcomes against true classes." },
    { id: "precision-vs-recall", title: "Precision vs. Recall", summary: "Two complementary views of a classifier's mistakes." },
  ],
  edges: [
    { from: "dataset", to: "features-and-labels" },
    { from: "features-and-labels", to: "model" },
    { from: "model", to: "training-vs-inference" },
    { from: "training-vs-inference", to: "supervised-learning" },
    { from: "training-vs-inference", to: "unsupervised-learning" },
    { from: "supervised-learning", to: "neural-networks" },
    { from: "model", to: "loss-function" },
    { from: "loss-function", to: "gradient-descent" },
    { from: "gradient-descent", to: "learning-rate" },
    { from: "supervised-learning", to: "overfitting" },
    { from: "overfitting", to: "regularization" },
    { from: "overfitting", to: "train-validation-test-split" },
    { from: "supervised-learning", to: "confusion-matrix" },
    { from: "confusion-matrix", to: "precision-vs-recall" },
  ],
};

// ---------------------------------------------------------------------------
// User graphs (mock mirror of the knowledge_graphs collection)

interface MockGraph {
  id: string;
  title: string;
  concepts: Concept[];
  edges: PrerequisiteEdge[];
  created_at: string;
}

function loadGraphs(): Record<string, MockGraph> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(GRAPHS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveGraphs(graphs: Record<string, MockGraph>) {
  window.localStorage.setItem(GRAPHS_KEY, JSON.stringify(graphs));
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "topic";
}

/** The graph a session reads concepts from; null when the id is unknown. */
function graphCurriculum(graphId: string): Curriculum | null {
  if (graphId === BUILTIN_GRAPH_ID) return CURRICULUM;
  const graph = loadGraphs()[graphId];
  return graph ? { concepts: graph.concepts, edges: graph.edges } : null;
}

// ---------------------------------------------------------------------------
// Rubrics

interface MockRubric {
  points: RubricPointRef[];
  misconception: { id: string; summary: string };
  /** Learner text that repairs the misconception. */
  resolvePattern: RegExp;
}

const GRADIENT_DESCENT_RUBRIC: MockRubric = {
  points: [
    { id: "gd-1", label: "Uses the gradient of the loss" },
    { id: "gd-2", label: "Steps opposite the gradient direction" },
    { id: "gd-3", label: "Learning rate controls the step size" },
    { id: "gd-4", label: "Iterates until convergence" },
  ],
  misconception: {
    id: "gd-mc-1",
    summary: "Believes the largest possible step size always converges fastest.",
  },
  resolvePattern:
    /overshoot|over-?shoot|diverg|oscillat|too\s+(big|large|high)|blow.?up|unstable|jump(s|ed)?\s+(over|past)|miss(es)?\s+the\s+minimum|small(er)?\s+step|step\s+size|learning\s+rate/i,
};

function rubricFor(conceptId: string, title: string): MockRubric {
  if (conceptId === "gradient-descent") return GRADIENT_DESCENT_RUBRIC;
  return {
    points: [
      { id: `${conceptId}-1`, label: `Defines ${title} precisely` },
      { id: `${conceptId}-2`, label: "Explains how it works" },
      { id: `${conceptId}-3`, label: "Gives a concrete example" },
      { id: `${conceptId}-4`, label: "Names a limitation or failure mode" },
    ],
    misconception: {
      id: `${conceptId}-mc-1`,
      summary: `Believes ${title} always applies, in every situation.`,
    },
    resolvePattern:
      /not\s+always|except|limit|edge\s+case|fails?|depends|only\s+(when|if)|doesn'?t\s+(always\s+)?work|breaks?\s+down|trade.?off/i,
  };
}

// ---------------------------------------------------------------------------
// Session storage

interface MockSession {
  session_id: string;
  /** Null while a freeform session's graph does not exist yet. */
  graph_id: string | null;
  concept_id: string;
  concept_title: string;
  /** The freeform topic; null for graph-concept sessions. */
  topic: string | null;
  mode: Mode;
  covered_ids: string[];
  misconception_posed: boolean;
  misconception_resolved: boolean;
  learner_turn_count: number;
  status: "active" | "ended";
  end_reason: EndReason | null;
  report: TeacherReport | null;
  graph_update: GraphUpdate | null;
  /** Stored envelopes keyed by client_turn_id (idempotent retries). */
  turns: Record<string, TurnEnvelope>;
  /** Absent in sessions stored before the snapshot endpoint existed. */
  created_at?: string;
  /** Learner quote per covered point; absent in older stored sessions. */
  evidence_by_point?: Record<string, { quote: string; turn_number: number }>;
}

/** Pre-multi-graph stored sessions lack the new fields; read them as builtin. */
function sessionGraphId(session: MockSession): string | null {
  if (session.graph_id !== undefined && session.graph_id !== null) {
    return session.graph_id;
  }
  return session.topic ? null : BUILTIN_GRAPH_ID;
}

function sessionTitle(session: MockSession): string {
  return (
    session.concept_title ??
    CURRICULUM.concepts.find((c) => c.id === session.concept_id)?.title ??
    session.concept_id
  );
}

function sessionRubric(session: MockSession): MockRubric {
  return rubricFor(session.concept_id, sessionTitle(session));
}

function loadAll(): Record<string, MockSession> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveAll(sessions: Record<string, MockSession>) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function requireSession(sessions: Record<string, MockSession>, id: string): MockSession {
  const session = sessions[id];
  if (!session) throw new ApiError("No such session.", "SESSION_NOT_FOUND", 404);
  return session;
}

// ---------------------------------------------------------------------------
// Progress and reports

function percentFor(session: MockSession): number {
  const rubric = sessionRubric(session);
  const raw = Math.round((session.covered_ids.length / rubric.points.length) * 100);
  const challengeCleared = session.misconception_posed && session.misconception_resolved;
  return challengeCleared ? raw : Math.min(raw, 99);
}

/** Next concept from the session's own graph; null for freeform sessions and
 * single-concept graphs (the report never depends on the just-created graph). */
function recommendedNext(session: MockSession): { id: string; title: string } | null {
  const graphId = sessionGraphId(session);
  if (graphId === null) return null;
  const curriculum = graphCurriculum(graphId);
  if (!curriculum) return null;
  const titles = new Map(curriculum.concepts.map((c) => [c.id, c.title]));
  const successor = curriculum.edges.find((e) => e.from === session.concept_id);
  if (successor) return { id: successor.to, title: titles.get(successor.to) ?? successor.to };
  const predecessor = curriculum.edges.find((e) => e.to === session.concept_id);
  if (predecessor) {
    return { id: predecessor.from, title: titles.get(predecessor.from) ?? predecessor.from };
  }
  const other = curriculum.concepts.find((c) => c.id !== session.concept_id);
  return other ? { id: other.id, title: other.title } : null;
}

function buildReport(session: MockSession): TeacherReport {
  const rubric = sessionRubric(session);
  const covered = rubric.points.filter((p) => session.covered_ids.includes(p.id));
  const uncovered = rubric.points.filter((p) => !session.covered_ids.includes(p.id));
  const finalPercent = percentFor(session);
  const gaps = uncovered.map((p) => `Never demonstrated: ${p.label.toLowerCase()}.`);
  if (session.misconception_posed && !session.misconception_resolved) {
    gaps.push(`Left unresolved: ${rubric.misconception.summary.toLowerCase()}`);
  }
  const evidence: DemonstratedEvidence[] = covered.flatMap((p) => {
    const source = session.evidence_by_point?.[p.id];
    return source
      ? [{ point: p, quote: source.quote, turn_number: source.turn_number }]
      : [];
  });
  return {
    final_percent: finalPercent,
    explained_well: covered.map((p) => `${p.label} — explained clearly with evidence.`),
    evidence,
    misconceptions_corrected:
      session.misconception_posed && session.misconception_resolved
        ? [rubric.misconception.summary.replace(/^Believes /, "Corrected the belief that ")]
        : [],
    gaps_and_accidental_implications: gaps,
    improvement_suggestion:
      uncovered.length > 0
        ? `Cover the missing point "${uncovered[0].label}" with one concrete example next time.`
        : "Add one concrete worked example to ground your strongest explanation.",
    recommended_next_concept: recommendedNext(session),
    mastery_achieved: finalPercent === 100,
  };
}

// ---------------------------------------------------------------------------
// Session-end graph work (mock mirror of the backend's summarizer + merge)

function finalizeGraph(session: MockSession): GraphUpdate | null {
  const graphId = sessionGraphId(session);
  if (graphId === BUILTIN_GRAPH_ID) return null; // ADR-0002: never mutated

  const graphs = loadGraphs();
  if (graphId === null) {
    // Freeform: create the graph — the topic node plus two canned neighbors.
    const slug = session.concept_id;
    const title = sessionTitle(session);
    const graph: MockGraph = {
      id: `mock-graph-${crypto.randomUUID().slice(0, 8)}`,
      title,
      concepts: [
        { id: slug, title, summary: session.topic ?? title },
        {
          id: `${slug}-fundamentals`,
          title: `${title} fundamentals`,
          summary: `The background ideas ${title} builds on.`,
        },
        {
          id: `${slug}-in-practice`,
          title: `${title} in practice`,
          summary: `Where ${title} shows up in the real world.`,
        },
      ],
      edges: [
        { from: `${slug}-fundamentals`, to: slug },
        { from: slug, to: `${slug}-in-practice` },
      ],
      created_at: new Date().toISOString(),
    };
    graphs[graph.id] = graph;
    saveGraphs(graphs);
    return {
      graph_id: graph.id,
      graph_title: graph.title,
      created: true,
      added_concepts: graph.concepts.map((c) => ({ id: c.id, title: c.title })),
    };
  }

  // User graph: append one deterministic neighbor if it is not there yet.
  const graph = graphs[graphId];
  if (!graph) return null;
  const newId = `${session.concept_id}-in-practice`;
  const added: { id: string; title: string }[] = [];
  if (!graph.concepts.some((c) => c.id === newId)) {
    const title = `${sessionTitle(session)} in practice`;
    graph.concepts.push({
      id: newId,
      title,
      summary: `Where ${sessionTitle(session)} shows up in the real world.`,
    });
    graph.edges.push({ from: session.concept_id, to: newId });
    added.push({ id: newId, title });
    saveGraphs(graphs);
  }
  return {
    graph_id: graph.id,
    graph_title: graph.title,
    created: false,
    added_concepts: added,
  };
}

// ---------------------------------------------------------------------------
// Student voice

function openingQuestion(conceptId: string, title: string, mode: Mode): string {
  if (conceptId === "gradient-descent" && mode === "confident") {
    return "I read that gradient descent just tries random parameter values until the loss looks small. That's basically it, right?";
  }
  switch (mode) {
    case "beginner":
      return `Hi! I keep seeing "${title}" mentioned everywhere, but I honestly couldn't explain it. What is it, in simple terms?`;
    case "confident":
      return `So I've read about ${title} and I'm pretty sure I've got the gist — but explain it your way, and I'll tell you if it matches what I know.`;
    case "skeptic":
      return `Before we start: why does ${title} even matter? Convince me it's not just jargon.`;
  }
}

function challengeText(session: MockSession): string {
  if (session.concept_id === "gradient-descent") {
    return "Okay, so the gradient tells us the direction. But then taking the biggest possible step each time must be fastest — why would anyone use small steps?";
  }
  const title = sessionTitle(session);
  switch (session.mode) {
    case "beginner":
      return `Oh nice, that makes sense! So ${title} is just always the right tool then — whatever the problem, I should use it?`;
    case "confident":
      return `Right, that matches what I know. And since ${title} works so well, it obviously applies to every situation — that's the whole point, isn't it?`;
    case "skeptic":
      return `Hmm. Every case I can think of, ${title} seems to handle. Can you name even one situation where it genuinely breaks down?`;
  }
}

function persistText(session: MockSession): string {
  if (session.concept_id === "gradient-descent") {
    return "I'm not convinced yet — if the gradient points the right way, bigger steps in that direction should simply get me there faster, no?";
  }
  return `But you didn't really answer my point — I still think ${sessionTitle(session)} applies everywhere. What's the actual limit?`;
}

function resolvedText(session: MockSession, nextPoint: RubricPointRef | undefined): string {
  const ack =
    session.concept_id === "gradient-descent"
      ? "Ohh — so steps that are too big can overshoot the minimum and even diverge. That finally makes sense."
      : "Ah, so it has real limits — it's a tool, not a law of nature. Good to know.";
  return nextPoint ? `${ack} One more thing: can you explain "${nextPoint.label.toLowerCase()}"?` : ack;
}

function nextPointText(session: MockSession, nextPoint: RubricPointRef): string {
  switch (session.mode) {
    case "beginner":
      return `I think I follow so far! Could you also explain "${nextPoint.label.toLowerCase()}"? I don't get that part yet.`;
    case "confident":
      return `Sure, that part I already knew. But what about "${nextPoint.label.toLowerCase()}" — I bet I have that right too.`;
    case "skeptic":
      return `Fine, provisionally accepted. Now defend the next part: "${nextPoint.label.toLowerCase()}" — and is that always true?`;
  }
}

function masteryText(session: MockSession): string {
  return session.concept_id === "gradient-descent"
    ? "That makes sense now — overshooting explains why my loss exploded. Thanks, teacher!"
    : `I could genuinely explain ${sessionTitle(session)} to someone else now — what it is, how it works, and where it stops working. Thanks, teacher!`;
}

function elaborateText(session: MockSession): string {
  return `Hmm, that was a bit short for me to work with. Can you explain it more fully? ${MODES[session.mode].name} needs a little more than that.`;
}

// ---------------------------------------------------------------------------
// Public mock API

export async function mockGetGraphs(): Promise<GraphList> {
  await delay(300);
  const userGraphs = Object.values(loadGraphs()).sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  return {
    graphs: [
      {
        id: BUILTIN_GRAPH_ID,
        title: "Machine Learning",
        source: "builtin",
        concept_count: CURRICULUM.concepts.length,
        created_at: null,
      },
      ...userGraphs.map((graph) => ({
        id: graph.id,
        title: graph.title,
        source: "user" as const,
        concept_count: graph.concepts.length,
        created_at: graph.created_at,
      })),
    ],
  };
}

export async function mockGetGraphCurriculum(graphId: string): Promise<Curriculum> {
  await delay(300);
  const curriculum = graphCurriculum(graphId);
  if (!curriculum) throw new ApiError("No such knowledge graph.", "GRAPH_NOT_FOUND", 404);
  return curriculum;
}

export async function mockDeleteGraph(graphId: string): Promise<void> {
  await delay(300);
  if (graphId === BUILTIN_GRAPH_ID) {
    throw new ApiError("The builtin graph cannot be deleted.", "GRAPH_NOT_DELETABLE", 409);
  }
  const graphs = loadGraphs();
  if (!graphs[graphId]) {
    throw new ApiError("No such knowledge graph.", "GRAPH_NOT_FOUND", 404);
  }
  delete graphs[graphId];
  saveGraphs(graphs);
}

export async function mockStartSession(req: StartSessionRequest): Promise<SessionCreated> {
  await delay(600);
  if (!["beginner", "confident", "skeptic"].includes(req.mode)) {
    throw new ApiError("Mode must be beginner, confident, or skeptic.", "INVALID_MODE", 422);
  }

  const topic = req.topic?.trim();
  let graphId: string | null;
  let concept: { id: string; title: string };
  if (topic) {
    if (req.graph_id || req.concept_id) {
      throw new ApiError("The request is invalid.", "VALIDATION_FAILED", 422);
    }
    if (topic.length > MAX_TOPIC_LENGTH) {
      throw new ApiError("The request is invalid.", "VALIDATION_FAILED", 422);
    }
    graphId = null;
    concept = { id: slugify(topic), title: topic };
  } else {
    if (!req.graph_id || !req.concept_id) {
      throw new ApiError("The request is invalid.", "VALIDATION_FAILED", 422);
    }
    const curriculum = graphCurriculum(req.graph_id);
    if (!curriculum) throw new ApiError("Unknown knowledge graph.", "INVALID_GRAPH", 422);
    const found = curriculum.concepts.find((c) => c.id === req.concept_id);
    if (!found) throw new ApiError("Unknown concept id.", "INVALID_CONCEPT", 422);
    graphId = req.graph_id;
    concept = { id: found.id, title: found.title };
  }

  const session: MockSession = {
    session_id: crypto.randomUUID(),
    graph_id: graphId,
    concept_id: concept.id,
    concept_title: concept.title,
    topic: topic ?? null,
    mode: req.mode,
    covered_ids: [],
    misconception_posed: false,
    misconception_resolved: false,
    learner_turn_count: 0,
    status: "active",
    end_reason: null,
    report: null,
    graph_update: null,
    turns: {},
    created_at: new Date().toISOString(),
  };
  const all = loadAll();
  all[session.session_id] = session;
  saveAll(all);
  return {
    session_id: session.session_id,
    graph_id: graphId,
    concept,
    mode: req.mode,
    student_text: openingQuestion(concept.id, concept.title, req.mode),
    progress: { percent: 0 },
    learner_turn_count: 0,
    status: "active",
    active_misconception: null,
  };
}

export async function mockGetSession(sessionId: string): Promise<SessionSnapshot> {
  await delay(300);
  const session = requireSession(loadAll(), sessionId);
  const rubric = sessionRubric(session);
  const envelopes = Object.values(session.turns).sort(
    (a, b) => a.turn_number - b.turn_number,
  );
  return {
    session_id: session.session_id,
    graph_id: sessionGraphId(session),
    concept: { id: session.concept_id, title: sessionTitle(session) },
    mode: session.mode,
    opening_text: openingQuestion(
      session.concept_id,
      sessionTitle(session),
      session.mode,
    ),
    turns: envelopes.map((envelope) => ({
      turn_number: envelope.turn_number,
      learner_transcript: envelope.learner_transcript,
      // The mock's stored envelopes don't retain the request's input_mode.
      input_mode: "text",
      student_text: envelope.student_text,
      newly_covered_points: envelope.newly_covered_points,
    })),
    progress: { percent: percentFor(session) },
    active_misconception:
      session.misconception_posed && !session.misconception_resolved
        ? rubric.misconception
        : null,
    learner_turn_count: session.learner_turn_count,
    status: session.status,
    end_reason: session.end_reason,
    report: session.report,
    graph_update: session.graph_update ?? null,
    created_at: session.created_at ?? new Date().toISOString(),
  };
}

export async function mockSubmitTurn(
  sessionId: string,
  req: SubmitTurnRequest,
): Promise<TurnEnvelope> {
  await delay(900 + Math.min(600, req.learner_text.length * 2));
  const all = loadAll();
  const session = requireSession(all, sessionId);

  // Idempotent retry: return the stored envelope without re-judging.
  const stored = session.turns[req.client_turn_id];
  if (stored) return stored;

  if (session.status === "ended") {
    throw new ApiError(
      "This session has ended; start a new session to continue teaching.",
      "SESSION_ENDED",
      409,
    );
  }
  const text = req.learner_text.trim();
  if (!text) throw new ApiError("The explanation must not be empty.", "EMPTY_SUBMISSION", 422);
  if (text.length > MAX_LEARNER_TEXT_LENGTH) {
    throw new ApiError("The explanation is too long.", "VALIDATION_FAILED", 422);
  }

  const rubric = sessionRubric(session);
  const uncovered = () => rubric.points.filter((p) => !session.covered_ids.includes(p.id));
  const newlyCovered: RubricPointRef[] = [];
  const cover = (n: number) => {
    for (const point of uncovered().slice(0, n)) {
      session.covered_ids.push(point.id);
      newlyCovered.push(point);
    }
  };

  const substantial = text.length > 60;
  let studentText: string;

  if (session.learner_turn_count === 0) {
    // First turn: credit the opening explanation, then pose the misconception challenge.
    if (substantial) {
      cover(2);
      session.misconception_posed = true;
      studentText = challengeText(session);
    } else {
      studentText = elaborateText(session);
    }
  } else if (session.misconception_posed && !session.misconception_resolved) {
    if (rubric.resolvePattern.test(text)) {
      session.misconception_resolved = true;
      cover(1);
      studentText = resolvedText(session, uncovered()[0]);
    } else {
      if (substantial) cover(1);
      studentText = persistText(session);
    }
  } else if (substantial) {
    cover(1);
    const next = uncovered()[0];
    studentText = next ? nextPointText(session, next) : masteryText(session);
  } else {
    studentText = elaborateText(session);
  }

  session.learner_turn_count += 1;
  // A verbatim prefix of the learner's own words serves as the evidence quote.
  const quote = text.length > 120 ? text.slice(0, 120) : text;
  session.evidence_by_point ??= {};
  for (const point of newlyCovered) {
    session.evidence_by_point[point.id] = {
      quote,
      turn_number: session.learner_turn_count,
    };
  }
  const percent = percentFor(session);
  if (percent === 100) {
    session.status = "ended";
    session.end_reason = "mastery";
    studentText = masteryText(session);
  }
  if (session.status === "ended") {
    session.report = buildReport(session);
    session.graph_update = finalizeGraph(session);
    if (session.graph_update?.created) {
      session.graph_id = session.graph_update.graph_id;
    }
  }

  const envelope: TurnEnvelope = {
    turn_number: session.learner_turn_count,
    learner_transcript: text,
    student_text: studentText,
    progress: { percent },
    newly_covered_points: newlyCovered,
    active_misconception:
      session.misconception_posed && !session.misconception_resolved
        ? rubric.misconception
        : null,
    learner_turn_count: session.learner_turn_count,
    status: session.status,
    end_reason: session.end_reason,
    report: session.report,
    graph_update: session.graph_update,
  };
  session.turns[req.client_turn_id] = envelope;
  saveAll(all);
  return envelope;
}

export async function mockFinishSession(sessionId: string): Promise<SessionFinished> {
  await delay(700);
  const all = loadAll();
  const session = requireSession(all, sessionId);
  if (session.status === "active") {
    session.status = "ended";
    session.end_reason = "learner_finished";
    session.report = buildReport(session);
    session.graph_update = finalizeGraph(session);
    if (session.graph_update?.created) {
      session.graph_id = session.graph_update.graph_id;
    }
    saveAll(all);
  }
  return {
    session_id: session.session_id,
    status: "ended",
    end_reason: session.end_reason!,
    progress: { percent: session.report!.final_percent },
    report: session.report!,
    graph_update: session.graph_update ?? null,
  };
}

export async function mockGetTurnSpeech(
  sessionId: string,
  turnNumber: number,
): Promise<Blob> {
  await delay(200);
  const session = requireSession(loadAll(), sessionId);
  if (turnNumber < 0 || turnNumber > session.learner_turn_count) {
    throw new ApiError("The session has no such turn.", "TURN_NOT_FOUND", 404);
  }
  throw new ApiError(
    "Speech synthesis is not available in mock mode.",
    "SPEECH_FAILED",
    502,
  );
}

export async function mockTranscribeAudio(audio: Blob): Promise<Transcription> {
  await delay(200);
  if (audio.size > 25_000_000) {
    throw new ApiError("The audio upload exceeds the size limit.", "UPLOAD_TOO_LARGE", 413);
  }
  throw new ApiError(
    "Transcription is not available in mock mode. You can type your explanation instead.",
    "TRANSCRIPTION_FAILED",
    502,
  );
}
