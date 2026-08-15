"use client";

import { useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { CharacterVideoAvatar } from "@/components/character-video-avatar";
import { ComposerSphere } from "@/components/composer-sphere";
import { SessionInsightSphere } from "@/components/session-insight-sphere";
import type { StudentAvatarState } from "@/components/student-avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { CHARACTER_BY_MODE } from "@/lib/characters";
import {
  finishSession,
  getTurnSpeech,
  IS_MOCK,
  submitTurn,
  transcribeAudio,
} from "@/lib/api";
import {
  applyFinished,
  applyTurn,
  loadStoredSession,
  recordMastery,
  saveStoredSession,
} from "@/lib/session-store";
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

  // Avatar "speaking" window: reading-time based, or audio-driven while TTS plays.
  const [avatarSpeaking, setAvatarSpeaking] = useState(false);
  const speakTimer = useRef<number | null>(null);

  function avatarSpeak(text: string) {
    if (speakTimer.current !== null) clearTimeout(speakTimer.current);
    setAvatarSpeaking(true);
    const duration = Math.min(2000 + text.length * 30, 9000);
    speakTimer.current = window.setTimeout(() => setAvatarSpeaking(false), duration);
  }

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

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    // localStorage is client-only; defer the read past hydration.
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const stored = loadStoredSession(id);
      if (stored) setSession(stored);
      else setMissing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages.length, sending]);

  useEffect(() => {
    const cache = audioCache.current;
    return () => {
      cache.forEach((url) => URL.revokeObjectURL(url));
      cache.clear();
      if (speakTimer.current !== null) clearTimeout(speakTimer.current);
    };
  }, []);

  function updateSession(next: StoredSession) {
    saveStoredSession(next);
    setSession(next);
    // Session progress is monotonic and final_percent equals the final
    // progress, so recording every turn keeps the home graph's water level
    // in sync with the live session without changing best-of semantics.
    recordMastery(next.concept.id, next.progress.percent);
  }

  async function speak(turnNumber: number) {
    if (!session) return;
    setVoiceNote(null);
    try {
      let url = audioCache.current.get(turnNumber);
      if (!url) {
        const blob = await getTurnSpeech(session.session_id, turnNumber);
        url = URL.createObjectURL(blob);
        audioCache.current.set(turnNumber, url);
      }
      audioRef.current ??= new Audio();
      audioRef.current.src = url;
      await audioRef.current.play();
      // Audio is playing: let it drive the avatar's speaking window instead
      // of the reading-time estimate.
      if (speakTimer.current !== null) clearTimeout(speakTimer.current);
      setAvatarSpeaking(true);
      audioRef.current.onended = () => setAvatarSpeaking(false);
    } catch (err) {
      // Non-blocking by contract: the text reply stays usable.
      setVoiceNote(
        err instanceof Error ? err.message : "Speech playback failed.",
      );
    }
  }

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
      updateSession(applyTurn(session, envelope));
      setPendingTurn(null);
      if (envelope.status === "active") avatarSpeak(envelope.student_text);
      if (voiceOn && envelope.status === "active") void speak(envelope.turn_number);
    } catch (err) {
      setTurnError(
        err instanceof Error ? err.message : "Failed to submit your explanation.",
      );
    } finally {
      setSending(false);
    }
  }

  function sendText() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    // New submission → new idempotency key. Retries reuse pendingTurn's key.
    void submit({ client_turn_id: crypto.randomUUID(), text, input_mode: "text" });
  }

  async function startRecording() {
    if (recording || sending || transcribing) return;
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
    setTranscribing(true);
    try {
      const { transcript } = await transcribeAudio(audio);
      if (transcript.trim()) {
        await submit({
          client_turn_id: crypto.randomUUID(),
          text: transcript.trim(),
          input_mode: "voice",
        });
      } else {
        setVoiceNote("Nothing was transcribed — try again or type instead.");
      }
    } catch (err) {
      // Transcription failures never touch the session; text input stays usable.
      setVoiceNote(
        err instanceof Error ? err.message : "Transcription failed. You can type instead.",
      );
    } finally {
      setTranscribing(false);
    }
  }

  async function finishAndReport() {
    if (!session || finishing) return;
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
            <AlertTitle>Session not found on this device</AlertTitle>
            <AlertDescription>
              Sessions live in your browser — this link may be from another
              device, or the session was cleared.
            </AlertDescription>
          </Alert>
          <Button variant="ghost" nativeButton={false} render={<Link href="/" />}>
            <ArrowLeft className="size-4" /> Back to the knowledge graph
          </Button>
        </div>
      </main>
    );
  }

  if (!session) return null;

  const mode = MODES[session.mode];
  const percent = session.progress.percent;
  const ended = session.status === "ended";
  const busy = sending || transcribing;

  // Conversation lifecycle → avatar state (priority order matters).
  const avatarState: StudentAvatarState = ended
    ? session.end_reason === "mastery"
      ? "happy"
      : "idle"
    : busy
      ? "thinking"
      : turnError
        ? "confused"
        : avatarSpeaking
          ? "speaking"
          : recording || input.trim().length > 0
            ? "listening"
            : "idle";
  const conversationStarted =
    session.learner_turn_count > 0 || busy || pendingTurn !== null;

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
            render={<Link href="/" />}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold leading-tight">
              {session.concept.title}
            </h1>
            <p className="text-xs text-muted-foreground">
              Teaching {mode.name} · {mode.label} · Turn{" "}
              {session.learner_turn_count}/8
            </p>
          </div>
          <div className="hidden w-48 shrink-0 items-center gap-2 sm:flex">
            <div className="flex-1">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium tabular-nums">{percent}%</span>
              </div>
              <Progress value={percent} className="h-2" />
            </div>
          </div>
          <ThemeToggle className="shrink-0" />
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label={voiceOn ? "Mute spoken replies" : "Unmute spoken replies"}
            aria-pressed={voiceOn}
            onClick={() => setVoiceOn((v) => !v)}
          >
            {voiceOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={finishing}
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
            <Progress value={percent} className="h-2" />
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
              characterId={CHARACTER_BY_MODE[session.mode]}
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
            className={cn(
              "space-y-4 overflow-y-auto p-4",
              conversationStarted && "flex-1",
            )}
          >
            {session.messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                session={session}
                onSpeak={speak}
              />
            ))}
            {pendingTurn && sending && (
              <MessageBubble
                message={{
                  id: "pending",
                  role: "learner",
                  text: pendingTurn.text,
                }}
                session={session}
                onSpeak={speak}
              />
            )}
            {transcribing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Transcribing your explanation…
              </div>
            )}
            {ended && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-50 p-4 text-sm dark:bg-emerald-500/10">
                <p className="font-medium">
                  {session.end_reason === "mastery"
                    ? `🎉 ${mode.name} reached 100% — mastery!`
                    : session.end_reason === "turn_limit"
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
                  : `Explain ${session.concept.title} to ${mode.name}…`
              }
              value={input}
              maxLength={MAX_LEARNER_TEXT_LENGTH}
              rows={2}
              className="max-h-40 resize-none rounded-2xl"
              disabled={busy || ended}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendText();
                }
              }}
            />
            <p className="mt-1 text-right text-[11px] text-muted-foreground">
              {recording
                ? "Recording… click the mic again to stop and send"
                : `${session.turns_remaining} turns left · Enter to send, or click the mic to talk`}
            </p>

            {/* The three action spheres under the text window: Speak, the
                session evidence (hover previews the points/misconception
                titles, click opens the full panel), and Send — one glass
                language, floating out of phase. */}
            <div className="mt-2 flex items-center justify-center gap-8 sm:gap-10">
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
                disabled={busy || ended}
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
              <SessionInsightSphere
                points={session.covered_points}
                misconception={session.active_misconception}
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
                disabled={busy || ended || input.trim().length === 0}
                aria-label="Send explanation"
                title="Send your explanation"
                onClick={sendText}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  session,
  onSpeak,
}: {
  message: ChatMessage;
  session: StoredSession;
  onSpeak: (turnNumber: number) => void;
}) {
  if (message.role === "learner") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {message.text}
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
        <div className="whitespace-pre-wrap rounded-2xl rounded-tl-sm border bg-muted/40 px-4 py-2.5 text-sm">
          {message.text}
        </div>
      </div>
    </div>
  );
}
