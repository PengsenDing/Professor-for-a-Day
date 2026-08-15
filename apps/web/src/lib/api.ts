// Typed API client for the Professor-for-a-Day product API.
// The contract is packages/shared/openapi.yaml (ADR 0001) — keep in sync.
//
// NEXT_PUBLIC_API_MODE=mock (default) uses the local mock engine;
// NEXT_PUBLIC_API_MODE=real talks to the FastAPI backend at
// NEXT_PUBLIC_API_BASE_URL (default http://127.0.0.1:8787, the contract's
// local development server).

import { ApiError } from "./errors";
import type {
  Curriculum,
  ErrorCode,
  ErrorEnvelope,
  SessionCreated,
  SessionFinished,
  SessionSnapshot,
  StartSessionRequest,
  SubmitTurnRequest,
  Transcription,
  TurnEnvelope,
} from "./types";
import {
  mockFinishSession,
  mockGetCurriculum,
  mockGetSession,
  mockGetTurnSpeech,
  mockStartSession,
  mockSubmitTurn,
  mockTranscribeAudio,
} from "./mock";

const MODE = process.env.NEXT_PUBLIC_API_MODE ?? "real";
export const IS_MOCK = MODE === "mock";
const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8787";

export { ApiError } from "./errors";

async function errorFromResponse(res: Response): Promise<ApiError> {
  let code: ErrorCode | undefined;
  let message = res.statusText || "Request failed.";
  try {
    const body = (await res.json()) as Partial<ErrorEnvelope>;
    if (body.error?.message) {
      code = body.error.code;
      message = body.error.message;
    }
  } catch {
    // non-JSON error body
  }
  return new ApiError(message, code, res.status);
}

async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 60_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
    });
    if (!res.ok) throw await errorFromResponse(res);
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("The request timed out. Please try again.");
    }
    throw new ApiError("Could not reach the backend. Is it running?");
  } finally {
    clearTimeout(timer);
  }
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

/** GET /api/curriculum — the 15 Concepts and prerequisite edges. Never invokes an LLM. */
export function getCurriculum(): Promise<Curriculum> {
  if (IS_MOCK) return mockGetCurriculum();
  return request<Curriculum>("/api/curriculum");
}

/** POST /api/sessions — start a Teaching Session; returns the opening question (turn 0). */
export function startSession(req: StartSessionRequest): Promise<SessionCreated> {
  if (IS_MOCK) return mockStartSession(req);
  return request<SessionCreated>("/api/sessions", jsonInit("POST", req));
}

/**
 * GET /api/sessions/{session_id} — learner-safe snapshot of a stored session
 * (ADR-0004). Read-only; never invokes an LLM or speech provider.
 */
export function getSession(sessionId: string): Promise<SessionSnapshot> {
  if (IS_MOCK) return mockGetSession(sessionId);
  return request<SessionSnapshot>(
    `/api/sessions/${encodeURIComponent(sessionId)}`,
  );
}

/**
 * POST /api/sessions/{session_id}/turns — submit one learner explanation.
 * Idempotent per client_turn_id: retries MUST reuse the same id.
 */
export function submitTurn(
  sessionId: string,
  req: SubmitTurnRequest,
): Promise<TurnEnvelope> {
  if (IS_MOCK) return mockSubmitTurn(sessionId, req);
  return request<TurnEnvelope>(
    `/api/sessions/${encodeURIComponent(sessionId)}/turns`,
    jsonInit("POST", req),
    120_000,
  );
}

/** POST /api/sessions/{session_id}/finish — end early and get the Teacher Report. Idempotent. */
export function finishSession(sessionId: string): Promise<SessionFinished> {
  if (IS_MOCK) return mockFinishSession(sessionId);
  return request<SessionFinished>(
    `/api/sessions/${encodeURIComponent(sessionId)}/finish`,
    jsonInit("POST"),
  );
}

/**
 * GET /api/sessions/{session_id}/turns/{turn_number}/speech — synthesize one
 * AI Student reply (turn 0 = opening question). Synthesized on every fetch;
 * callers should cache the returned blob for replay.
 */
export async function getTurnSpeech(
  sessionId: string,
  turnNumber: number,
): Promise<Blob> {
  if (IS_MOCK) return mockGetTurnSpeech(sessionId, turnNumber);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(
      `${BASE_URL}/api/sessions/${encodeURIComponent(sessionId)}/turns/${turnNumber}/speech`,
      { signal: controller.signal },
    );
    if (!res.ok) throw await errorFromResponse(res);
    return await res.blob();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("Speech synthesis timed out.", "SPEECH_FAILED");
    }
    throw new ApiError("Could not reach the backend.", "SPEECH_FAILED");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST /api/speech/transcriptions — pure speech-to-text. The transcript is
 * then submitted through the ordinary turn contract with input_mode "voice".
 */
export async function transcribeAudio(audio: Blob): Promise<Transcription> {
  if (IS_MOCK) return mockTranscribeAudio(audio);
  const form = new FormData();
  form.append("audio", audio, "recording.webm");
  return request<Transcription>("/api/speech/transcriptions", {
    method: "POST",
    body: form,
  });
}
