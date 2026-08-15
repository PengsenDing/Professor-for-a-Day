"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Flag,
  Loader2,
  Mic,
  RotateCcw,
  Send,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { CharacterVideoAvatar } from "@/components/character-video-avatar";
import { ComposerSphere } from "@/components/composer-sphere";
import { ProgressGainChips } from "@/components/progress-gain-chips";
import { SessionInsightSphere } from "@/components/session-insight-sphere";
import type { StudentAvatarState } from "@/components/student-avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { CHARACTER_BY_MODE } from "@/lib/characters";
import {
  finishSession,
  getSession,
  getTurnSpeech,
  IS_MOCK,
  startSession,
  submitTurn,
  transcribeAudio,
} from "@/lib/api";
import { finishAbandonedSessions } from "@/lib/finish-abandoned";
import type { GainChip } from "@/lib/progress-gain";
import { buildGainChips } from "@/lib/progress-gain";
import {
  LEARNER_TRANSCRIPT_MS_PER_WORD,
  STUDENT_FALLBACK_MS_PER_WORD,
} from "@/lib/reveal";
import type { PendingStart } from "@/lib/session-store";
import {
  applyFinished,
  applyTurn,
  clearPendingStart,
  consumeFreshSession,
  loadPendingStart,
  loadStoredSession,
  markFreshSession,
  placeholderFromPending,
  recordMastery,
  saveStoredSession,
  sessionFromCreated,
  sessionFromSnapshot,
} from "@/lib/session-store";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useRevealManager } from "@/lib/use-reveal-manager";
import type { ChatMessage, InputMode, StoredSession } from "@/lib/types";
import { MAX_LEARNER_TEXT_LENGTH, MODES } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PendingTurn {
  client_turn_id: string;
  text: string;
  input_mode: InputMode;
}

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<StoredSession | null>(null);
  const [missing, setMissing] = useState(false);

  // "/session/new": the setup page navigated here immediately and stashed the
  // start request; this page fires POST /api/sessions itself and renders the
  // session view in a waiting state until the opening question arrives, then
  // swaps the real id into the URL. A refresh mid-creation reloads the stash
  // and simply fires the request again.
  const isNew = id === "new";
  const [pendingStart, setPendingStart] = useState<PendingStart | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const startFired = useRef(false);

  const createSession = useCallback(
    async (pending: PendingStart) => {
      setStartError(null);
      try {
        const created = await startSession(pending.request);
        finishAbandonedSessions(created.session_id);
        saveStoredSession(sessionFromCreated(created));
        markFreshSession(created.session_id);
        clearPendingStart();
        // Deliberately no setSession here: swapping the id remounts the page,
        // and the remounted instance must be the one that loads the session
        // and runs the fresh-session reveal + speech of the opening question
        // (a reveal begun in this instance would die with its unmount).
        router.replace(`/session/${created.session_id}`, { scroll: false });
      } catch (err) {
        setStartError(
          err instanceof Error ? err.message : "Something went wrong.",
        );
      }
    },
    [router],
  );

  useEffect(() => {
    if (!isNew || startFired.current) return;
    startFired.current = true;
    // sessionStorage is client-only; defer the read past hydration.
    void Promise.resolve().then(() => {
      const pending = loadPendingStart();
      if (!pending) {
        // Nothing stashed (deep link straight to /session/new): nothing to
        // create, so back to the graph picker.
        router.replace("/");
        return;
      }
      setPendingStart(pending);
      void createSession(pending);
    });
  }, [isNew, router, createSession]);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingTurn, setPendingTurn] = useState<PendingTurn | null>(null);
  const [turnError, setTurnError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  // Voice output: synthesize-on-fetch, cache blobs client-side (ADR 0003).
  const [voiceOn, setVoiceOn] = useState(!IS_MOCK);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const audioCache = useRef(new Map<number, string>());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Avatar "speaking" window while real TTS audio plays; the word-by-word
  // reveal covers the muted/failed-voice case (see avatarState below).
  const [avatarSpeaking, setAvatarSpeaking] = useState(false);

  // Word-by-word reveal of AI Student replies and voice transcripts —
  // a purely visual effect (the contract stays atomic JSON + one MP3).
  const reducedMotion = useReducedMotion();
  const {
    begin: beginReveal,
    attachAudio,
    detachAudio,
    detachAllAudio,
    skip: skipReveal,
    skipAll: skipAllReveals,
    revealTexts,
  } = useRevealManager(!reducedMotion);

  // Progress gains celebrate before they count: the bar freezes at its
  // pre-turn value while each confirmed point (or cleared misconception)
  // shows as a chip that flies into the bar; landing advances the displayed
  // percent. Null = nothing in flight, show the stored percent.
  const [displayedPercent, setDisplayedPercent] = useState<number | null>(null);
  const [gainChips, setGainChips] = useState<GainChip[]>([]);
  const headerBarRef = useRef<HTMLDivElement>(null);
  const mobileBarRef = useRef<HTMLDivElement>(null);

  // The chips need whichever progress bar is actually on screen: the header
  // copy exists on sm+ only, the inline copy only below that breakpoint.
  const getVisibleBar = useCallback(() => {
    for (const bar of [headerBarRef.current, mobileBarRef.current]) {
      if (bar && bar.offsetWidth > 0) return bar;
    }
    return null;
  }, []);

  const handleChipConsumed = useCallback(
    (chip: GainChip) => {
      setGainChips((chips) => chips.filter((c) => c.key !== chip.key));
      // Monotonic like the percent itself: a late-landing chip never drags
      // the bar backwards under a newer one.
      setDisplayedPercent((p) => Math.max(p ?? 0, chip.percentAfter));
      if (!reducedMotion) {
        // A short glow where the chip merged, in step with the width tween.
        getVisibleBar()?.animate(
          [
            { boxShadow: "0 0 0 0 rgb(16 185 129 / 0.5)" },
            { boxShadow: "0 0 0 10px rgb(16 185 129 / 0)" },
          ],
          { duration: 700, easing: "ease-out" },
        );
      }
    },
    [getVisibleBar, reducedMotion],
  );

  // One-shot celebration: the video character greets when mastery is reached.
  const [celebrateSignal, setCelebrateSignal] = useState(0);
  const celebrated = useRef(false);
  useEffect(() => {
    if (
      !celebrated.current &&
      session?.status === "ended" &&
      session.end_reason === "mastery"
    ) {
      celebrated.current = true;
      setCelebrateSignal((n) => n + 1);
    }
  }, [session?.status, session?.end_reason]);

  // Voice input: push-to-talk, transcribed then submitted as an ordinary turn.
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  // Bumped when the learner cancels voice input; an in-flight transcription
  // compares its captured generation and discards a stale result instead of
  // submitting it. Nothing reaches the AI Student until submit() runs.
  const voiceGenRef = useRef(0);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Stand-in session while creation is in flight, so the ordinary session
  // view renders (header, avatar, composer) with the opening question pending.
  const placeholder = useMemo(
    () => (pendingStart ? placeholderFromPending(pendingStart) : null),
    [pendingStart],
  );

  useEffect(() => {
    // "new" is the waiting state, not a stored session id; the creation
    // effect above owns it (and hands over via router.replace when done).
    if (id === "new") return;
    let cancelled = false;
    // localStorage is client-only; defer the read past hydration.
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      const stored = loadStoredSession(id);
      if (stored) {
        setSession(stored);
        return;
      }
      // localStorage-first, server-fallback (ADR-0004): rebuild the session
      // from the snapshot endpoint, persist it, and proceed as a refresh.
      try {
        const restored = sessionFromSnapshot(await getSession(id));
        if (cancelled) return;
        saveStoredSession(restored);
        setSession(restored);
      } catch {
        if (!cancelled) setMissing(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages.length, sending]);

  // A revealing bubble keeps growing: stay pinned to the bottom while it
  // does — unless the learner has scrolled up to re-read something.
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  function handleScroll() {
    const el = scrollAreaRef.current;
    if (!el) return;
    stickToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }
  useEffect(() => {
    if (Object.keys(revealTexts).length === 0) return;
    if (!stickToBottom.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [revealTexts]);

  useEffect(() => {
    const cache = audioCache.current;
    return () => {
      cache.forEach((url) => URL.revokeObjectURL(url));
      cache.clear();
    };
  }, []);

  function updateSession(next: StoredSession) {
    saveStoredSession(next);
    setSession(next);
    // Session progress is monotonic and final_percent equals the final
    // progress, so recording every turn keeps the home graph's water level
    // in sync with the live session without changing best-of semantics.
    // A freeform session has no graph until its ending turn creates one
    // (applyTurn backfills graph_id from graph_update); until then there is
    // no graph namespace to record into.
    if (next.graph_id !== null) {
      recordMastery(next.graph_id, next.concept.id, next.progress.percent);
    }
  }

  const speak = useCallback(
    async (
      sessionId: string,
      turnNumber: number,
      opts?: { revealId?: string; quietAutoplayBlock?: boolean },
    ) => {
      setVoiceNote(null);
      try {
        let url = audioCache.current.get(turnNumber);
        if (!url) {
          const blob = await getTurnSpeech(sessionId, turnNumber);
          url = URL.createObjectURL(blob);
          audioCache.current.set(turnNumber, url);
        }
        const audio = (audioRef.current ??= new Audio());
        // A reveal paced by this element must let go before src changes.
        detachAllAudio();
        audio.src = url;
        await audio.play();
        setAvatarSpeaking(true);
        // If this turn's reveal is still running, pace its remaining words
        // across the audio so text and voice finish together.
        if (opts?.revealId) attachAudio(opts.revealId, audio);
        audio.onended = () => {
          setAvatarSpeaking(false);
          if (opts?.revealId) detachAudio(opts.revealId);
        };
      } catch (err) {
        // The auto-spoken opening question may hit the browser's autoplay
        // policy; that is not a speech failure worth a warning.
        if (
          opts?.quietAutoplayBlock &&
          err instanceof DOMException &&
          err.name === "NotAllowedError"
        ) {
          return;
        }
        // Non-blocking by contract: the text reply stays usable.
        setVoiceNote(
          err instanceof Error ? err.message : "Speech playback failed.",
        );
      }
    },
    [attachAudio, detachAudio, detachAllAudio],
  );

  // A brand-new session (marker set by the home page) animates and speaks
  // its opening question once; a refresh renders history instantly.
  const freshHandled = useRef(false);
  useEffect(() => {
    if (!session || freshHandled.current) return;
    freshHandled.current = true;
    if (!consumeFreshSession(session.session_id)) return;
    const opening = session.messages[0];
    if (opening?.role !== "student") return;
    const sessionId = session.session_id;
    // Deferred so the effect body stays render-clean; deliberately not
    // cleared on cleanup — StrictMode's double-invoke would cancel it and
    // freshHandled blocks the second run from rescheduling.
    window.setTimeout(() => {
      beginReveal(opening.id, opening.text, STUDENT_FALLBACK_MS_PER_WORD);
      if (voiceOn) {
        void speak(sessionId, 0, {
          revealId: opening.id,
          quietAutoplayBlock: true,
        });
      }
    }, 0);
  }, [session, voiceOn, beginReveal, speak]);

  async function submit(turn: PendingTurn) {
    if (!session || sending) return;
    setSending(true);
    setTurnError(null);
    setPendingTurn(turn);
    try {
      const envelope = await submitTurn(session.session_id, {
        learner_text: turn.text,
        input_mode: turn.input_mode,
        client_turn_id: turn.client_turn_id,
      });
      // Queue the celebration before the session state lands so the frozen
      // pre-turn percent and the new messages render in the same batch.
      const chips = buildGainChips(
        envelope,
        session.progress.percent,
        session.active_misconception,
      );
      if (chips.length > 0) {
        setDisplayedPercent((p) => p ?? session.progress.percent);
        setGainChips((queue) => [...queue, ...chips]);
      }
      const next = applyTurn(session, envelope, turn.client_turn_id);
      updateSession(next);
      setPendingTurn(null);
      // The reply (applyTurn appends it last) reveals word by word — the
      // session's final message included, which the ended banner waits for.
      const studentMessage = next.messages[next.messages.length - 1];
      beginReveal(
        studentMessage.id,
        studentMessage.text,
        STUDENT_FALLBACK_MS_PER_WORD,
      );
      if (voiceOn && envelope.status === "active") {
        void speak(session.session_id, envelope.turn_number, {
          revealId: studentMessage.id,
        });
      }
    } catch (err) {
      setTurnError(
        err instanceof Error ? err.message : "Failed to submit your explanation.",
      );
    } finally {
      setSending(false);
    }
  }

  function sendText() {
    // The learner can pre-type while the session is still being created, but
    // nothing can be submitted (and the draft must not be cleared) until the
    // session exists.
    if (!session) return;
    const text = input.trim();
    if (!text) return;
    setInput("");
    skipAllReveals();
    // New submission → new idempotency key. Retries reuse pendingTurn's key.
    void submit({ client_turn_id: crypto.randomUUID(), text, input_mode: "text" });
  }

  async function startRecording() {
    if (recording || sending || transcribing) return;
    // Starting to talk means the learner has moved on from the reveal.
    skipAllReveals();
    setVoiceNote(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        void handleRecording(new Blob(chunks, { type: recorder.mimeType }));
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setVoiceNote("Microphone access failed. You can type your explanation instead.");
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function toggleRecording() {
    if (recording) stopRecording();
    else void startRecording();
  }

  // Discard the current voice input without sending anything to the AI
  // Student: drop a live recording on the floor, or mark an in-flight
  // transcription stale so its result is thrown away when it arrives.
  const cancelVoiceInput = useCallback(() => {
    voiceGenRef.current += 1;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      // Detach onstop so the audio is never handed to transcription.
      recorder.onstop = null;
      recorder.stop();
      recorder.stream.getTracks().forEach((t) => t.stop());
    }
    setRecording(false);
    setTranscribing(false);
  }, []);

  // Escape cancels voice input — but only until the turn is actually being
  // submitted; after that the explanation is already on its way.
  useEffect(() => {
    if ((!recording && !transcribing) || sending) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") cancelVoiceInput();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [recording, transcribing, sending, cancelVoiceInput]);

  // Release the microphone if the learner leaves mid-recording.
  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
        recorder.stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  async function handleRecording(audio: Blob) {
    const generation = voiceGenRef.current;
    setTranscribing(true);
    try {
      const { transcript } = await transcribeAudio(audio);
      // Canceled while transcribing: discard the transcript, send nothing.
      if (voiceGenRef.current !== generation) return;
      if (transcript.trim()) {
        // The transcript reveals word by word on the optimistic pending
        // bubble, filling the Judge wait; keyed by client_turn_id so the
        // confirmed message continues seamlessly instead of restarting.
        const clientTurnId = crypto.randomUUID();
        beginReveal(
          clientTurnId,
          transcript.trim(),
          LEARNER_TRANSCRIPT_MS_PER_WORD,
        );
        await submit({
          client_turn_id: clientTurnId,
          text: transcript.trim(),
          input_mode: "voice",
        });
      } else {
        setVoiceNote("Nothing was transcribed — try again or type instead.");
      }
    } catch (err) {
      // A canceled transcription failing is not worth a warning.
      if (voiceGenRef.current !== generation) return;
      // Transcription failures never touch the session; text input stays usable.
      setVoiceNote(
        err instanceof Error ? err.message : "Transcription failed. You can type instead.",
      );
    } finally {
      // After a cancel the flag is already down — and a newer recording may
      // even own it again, so a stale generation must not touch it.
      if (voiceGenRef.current === generation) setTranscribing(false);
    }
  }

  async function finishAndReport() {
    if (!session || finishing) return;
    // Finishing is the strongest "moved on" signal: snap any running reveal.
    skipAllReveals();
    if (session.status === "ended") {
      router.push(`/session/${session.session_id}/report`);
      return;
    }
    setFinishing(true);
    setTurnError(null);
    try {
      const finished = await finishSession(session.session_id);
      updateSession(applyFinished(session, finished));
      router.push(`/session/${session.session_id}/report`);
    } catch (err) {
      setTurnError(err instanceof Error ? err.message : "Could not finish the session.");
      setFinishing(false);
    }
  }

  if (missing) {
    return (
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <Alert variant="destructive">
            <AlertTitle>Session not found</AlertTitle>
            <AlertDescription>
              This session isn&apos;t stored in your browser and the server
              doesn&apos;t know it either — the link may be wrong, or the
              session was removed.
            </AlertDescription>
          </Alert>
          <Button variant="ghost" nativeButton={false} render={<Link href="/" />}>
            <ArrowLeft className="size-4" /> Back to the knowledge graph
          </Button>
        </div>
      </main>
    );
  }

  // While creation is in flight the placeholder stands in; the moment the
  // real session lands the same view re-renders from it seamlessly.
  const view = session ?? placeholder;
  if (!view) return null;
  const starting = session === null;

  const mode = MODES[view.mode];
  // While gain chips are in flight the bar shows the frozen/staged value;
  // otherwise the stored percent (they re-converge on the last chip).
  const percent = displayedPercent ?? view.progress.percent;
  const ended = view.status === "ended";
  const busy = sending || transcribing;
  // Only the newest reply ever animates, so "any student message revealing"
  // means the student is mid-speech (drives the avatar and the ended banner).
  const studentRevealing = view.messages.some(
    (m) => m.role === "student" && m.id in revealTexts,
  );

  // Conversation lifecycle → avatar state (priority order matters).
  const avatarState: StudentAvatarState = starting
    ? startError
      ? "confused"
      : "thinking"
    : ended
      ? view.end_reason === "mastery"
        ? "happy"
        : "idle"
      : busy
        ? "thinking"
        : turnError
          ? "confused"
          : avatarSpeaking || studentRevealing
            ? "speaking"
            : recording || input.trim().length > 0
              ? "listening"
              : "idle";
  const conversationStarted =
    view.learner_turn_count > 0 || busy || pendingTurn !== null;

  return (
    <div className="flex h-dvh flex-col">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label="Back to the knowledge graph"
            nativeButton={false}
            render={
              <Link
                href={view.graph_id ? `/graphs/${view.graph_id}` : "/"}
              />
            }
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold leading-tight">
              {view.concept.title}
            </h1>
            <p className="text-xs text-muted-foreground">
              Teaching {mode.name} · {mode.label} · Turn{" "}
              {view.learner_turn_count}/8
            </p>
          </div>
          <div className="hidden w-48 shrink-0 items-center gap-2 sm:flex">
            <div className="flex-1">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium tabular-nums">{percent}%</span>
              </div>
              {/* Ref'd wrapper: the flight target and merge-glow surface. */}
              <div ref={headerBarRef} className="rounded-full">
                <Progress value={percent} className="h-2" />
              </div>
            </div>
          </div>
          <ThemeToggle className="shrink-0" />
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label={voiceOn ? "Mute spoken replies" : "Unmute spoken replies"}
            aria-pressed={voiceOn}
            onClick={() => {
              const next = !voiceOn;
              setVoiceOn(next);
              if (!next) {
                // Mute stops the current audio; a running reveal degrades
                // to fallback pacing from wherever it is.
                audioRef.current?.pause();
                setAvatarSpeaking(false);
                detachAllAudio();
              }
            }}
          >
            {voiceOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={finishing || starting}
            onClick={finishAndReport}
          >
            {finishing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : ended ? (
              <FileText className="size-4" />
            ) : (
              <Flag className="size-4" />
            )}
            <span className="hidden sm:inline">
              {ended ? "View Report" : "Finish Session"}
            </span>
          </Button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden p-4">
        <section className="flex min-h-0 flex-1 flex-col bg-background">
          {/* The header progress bar is sm+; small screens get it here. */}
          <div className="px-3 pt-1 sm:hidden">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium tabular-nums">{percent}%</span>
            </div>
            <div ref={mobileBarRef} className="rounded-full">
              <Progress value={percent} className="h-2" />
            </div>
          </div>

          {/* The student: centered and large before the first turn, then a
              compact strip docked above the conversation. */}
          <div
            className={cn(
              "flex flex-col items-center justify-center transition-all duration-500",
              conversationStarted ? "gap-0 py-1.5" : "flex-1 gap-1 py-6",
            )}
          >
            {/* The video character mirrors the conversation: the listening
                clip while the learner talks (or the reply is being thought
                over), the speaking clip while AI audio plays or a reply is
                on screen, idle otherwise. On mastery it greets once as a
                little celebration. */}
            <CharacterVideoAvatar
              characterId={CHARACTER_BY_MODE[view.mode]}
              isListening={
                avatarState === "listening" || avatarState === "thinking"
              }
              isSpeaking={avatarState === "speaking"}
              greetSignal={celebrateSignal}
              showBubble={false}
              className={cn(
                "transition-all duration-500",
                conversationStarted
                  ? "size-16 sm:size-20"
                  : "size-40 sm:size-52",
              )}
            />

          </div>

          <div
            ref={scrollAreaRef}
            onScroll={handleScroll}
            className={cn(
              "space-y-4 overflow-y-auto p-4",
              conversationStarted && "flex-1",
            )}
          >
            {starting && !startError && (
              <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                {mode.name} is thinking of an opening question…
              </div>
            )}
            {starting && startError && pendingStart && (
              <Alert variant="destructive">
                <AlertTitle>Could not start the session</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center gap-2">
                  <span>{startError}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void createSession(pendingStart)}
                  >
                    <RotateCcw className="size-3.5" /> Retry
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {view.messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                session={view}
                onSpeak={(turnNumber) => speak(view.session_id, turnNumber)}
                revealText={revealTexts[m.id] ?? null}
                onSkipReveal={() => skipReveal(m.id)}
              />
            ))}
            {pendingTurn && sending && (
              <MessageBubble
                message={{
                  id: pendingTurn.client_turn_id,
                  role: "learner",
                  text: pendingTurn.text,
                }}
                session={view}
                onSpeak={(turnNumber) => speak(view.session_id, turnNumber)}
                revealText={revealTexts[pendingTurn.client_turn_id] ?? null}
                onSkipReveal={() => skipReveal(pendingTurn.client_turn_id)}
              />
            )}
            {recording && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mic className="size-3.5 animate-pulse" />
                Listening…
              </div>
            )}
            {transcribing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Transcribing your explanation…
                {!sending && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={cancelVoiceInput}
                  >
                    <X className="size-3.5" /> Cancel
                  </Button>
                )}
              </div>
            )}
            {ended && !studentRevealing && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-50 p-4 text-sm dark:bg-emerald-500/10">
                <p className="font-medium">
                  {view.end_reason === "mastery"
                    ? `🎉 ${mode.name} reached 100% — mastery!`
                    : view.end_reason === "turn_limit"
                      ? "The eight-turn limit was reached."
                      : "You finished the session."}
                </p>
                <Button size="sm" className="mt-2" onClick={finishAndReport}>
                  <FileText className="size-4" /> View your Teacher Report
                </Button>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="p-3">
            {turnError && (
              <Alert variant="destructive" className="mb-3">
                <AlertTitle>Your explanation didn&apos;t go through</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center gap-2">
                  <span>{turnError}</span>
                  {pendingTurn && (
                    <span className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={sending}
                        onClick={() => submit(pendingTurn)}
                      >
                        <RotateCcw className="size-3.5" /> Retry
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          skipReveal(pendingTurn.client_turn_id);
                          setPendingTurn(null);
                          setTurnError(null);
                        }}
                      >
                        <Trash2 className="size-3.5" /> Discard
                      </Button>
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}
            {voiceNote && (
              <p className="mb-2 text-xs text-amber-600">{voiceNote}</p>
            )}
            <Textarea
              placeholder={
                ended
                  ? "This session has ended."
                  : `Explain ${view.concept.title} to ${mode.name}…`
              }
              value={input}
              maxLength={MAX_LEARNER_TEXT_LENGTH}
              rows={2}
              className="max-h-40 resize-none rounded-2xl"
              disabled={busy || ended}
              onChange={(e) => {
                setInput(e.target.value);
                // Typing the next explanation means the learner has moved
                // on: snap any running reveal to complete.
                if (e.target.value.trim()) skipAllReveals();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendText();
                }
              }}
            />
            <p className="mt-1 text-right text-[11px] text-muted-foreground">
              {recording
                ? "Recording… click the mic to stop and send · Esc to cancel"
                : "Enter to send, or click the mic to talk"}
            </p>

            {/* The three action spheres under the text window: Speak, the
                session evidence (hover previews the points/misconception
                titles, click opens the full panel), and Send — one glass
                language, floating out of phase. */}
            <div className="mt-2 flex items-center justify-center gap-8 sm:gap-10">
              {/* Anchored wrapper so the cancel button can sit exactly to
                  the left of the mic sphere while it records, without
                  shifting the centered three-sphere row. */}
              <div className="relative">
                {recording && (
                  <Button
                    variant="ghost"
                    className="absolute right-full top-1/2 mr-3 h-auto -translate-y-1/2 flex-col gap-1 px-2.5 py-1.5 text-muted-foreground"
                    aria-label="Cancel recording without sending"
                    title="Cancel — nothing is sent"
                    onClick={cancelVoiceInput}
                  >
                    <X className="size-4" />
                    <span className="text-[11px] leading-none">Cancel</span>
                  </Button>
                )}
                <ComposerSphere
                  icon={
                    recording ? (
                      <Square className="size-5 animate-pulse sm:size-6" />
                    ) : (
                      <Mic className="size-5 sm:size-6" />
                    )
                  }
                  active={recording}
                  danger={recording}
                  float={{ duration: "5.7s", delay: "-2.3s" }}
                  disabled={busy || ended || starting}
                  aria-label={
                    recording ? "Stop recording and send" : "Start voice input"
                  }
                  aria-pressed={recording}
                  title={
                    recording
                      ? "Click to stop and send your explanation"
                      : "Click to start talking"
                  }
                  onClick={toggleRecording}
                />
              </div>
              <SessionInsightSphere
                points={view.covered_points}
                misconception={view.active_misconception}
                studentName={mode.name}
              />
              <ComposerSphere
                icon={
                  sending ? (
                    <Loader2 className="size-5 animate-spin sm:size-6" />
                  ) : (
                    <Send className="size-5 sm:size-6" />
                  )
                }
                float={{ duration: "4.6s", delay: "-3.4s" }}
                disabled={busy || ended || starting || input.trim().length === 0}
                aria-label="Send explanation"
                title="Send your explanation"
                onClick={sendText}
              />
            </div>
          </div>
        </section>
      </div>

      <ProgressGainChips
        queue={gainChips}
        getTarget={getVisibleBar}
        reducedMotion={reducedMotion}
        onConsumed={handleChipConsumed}
      />
    </div>
  );
}

function MessageBubble({
  message,
  session,
  onSpeak,
  revealText,
  onSkipReveal,
}: {
  message: ChatMessage;
  session: StoredSession;
  onSpeak: (turnNumber: number) => void;
  /** Visible prefix while the message reveals word by word; null = full text. */
  revealText: string | null;
  onSkipReveal: () => void;
}) {
  const revealing = revealText !== null;
  const text = revealing ? revealText : message.text;
  // While revealing, the bubble body doubles as a skip control (the replay
  // button sits outside it, so the two never collide).
  const skipProps = revealing
    ? {
        role: "button" as const,
        tabIndex: 0,
        "aria-label": "Show the full message now",
        onClick: onSkipReveal,
        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSkipReveal();
          }
        },
      }
    : {};
  if (message.role === "learner") {
    return (
      <div className="flex justify-end">
        <div
          {...skipProps}
          className={cn(
            "max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground",
            revealing && "cursor-pointer",
          )}
        >
          {text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start">
      <div className="max-w-[80%] space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{MODES[session.mode].name}</span>
          {message.turn_number === 0 && (
            <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
              opening question
            </Badge>
          )}
          {message.turn_number !== undefined && (
            <button
              type="button"
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Play this reply aloud"
              onClick={() => onSpeak(message.turn_number!)}
            >
              <Volume2 className="size-3.5" />
            </button>
          )}
        </div>
        <div
          {...skipProps}
          className={cn(
            // text-base (not text-sm): the student's replies are the core
            // reading surface of the session, so they get the larger size.
            "whitespace-pre-wrap rounded-2xl rounded-tl-sm border bg-muted/40 px-4 py-3 text-base",
            revealing && "cursor-pointer",
          )}
        >
          {text}
        </div>
      </div>
    </div>
  );
}
