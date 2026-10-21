"use client";

// School / contestant screen (spec §3.4). Mobile-first, single page per turn:
// identity → turn status → selection board → question → submission receipt.
// The correct answer never reaches this client before an authorized reveal.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMatchRealtime } from "@/lib/realtime";
import { AutoAdvancePill, TimerRing } from "@/components/Countdown";
import { playSound, readSoundPref, unlockAudio, writeSoundPref } from "@/lib/sound";
import CategoryBoard from "@/components/CategoryBoard";
import MathText from "@/components/MathText";
import { FORMAT_LABELS } from "@/lib/formats";

export default function PlayPage() {
  const router = useRouter();
  const [matchId, setMatchId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [soundOn, setSoundOn] = useState(true);
  const soundRef = useRef<{ status?: string; turn?: number; resultKey?: string }>({});

  useEffect(() => setSoundOn(readSoundPref()), []);

  useEffect(() => {
    const stored = sessionStorage.getItem("fassa_match");
    if (!stored) {
      router.replace("/join");
      return;
    }
    setMatchId(stored);
  }, [router]);

  const { snapshot, connected, error, send } = useMatchRealtime(matchId);

  // a new active question — or a new attempt on the same question (the server
  // counted a failed try and left it open) — clears the previous receipt
  const activeMqId = snapshot?.activeQuestion.matchQuestionId ?? null;
  const attemptsUsed = snapshot?.activeQuestion.attemptsUsed ?? 0;
  useEffect(() => {
    setReceipt(null);
    setAnswer("");
    setChosenId(null);
  }, [activeMqId, attemptsUsed]);

  const viewerSchoolId = snapshot?.viewerSchoolId ?? null;
  const activeSchoolId = snapshot?.turn.activeSchoolId ?? null;
  const isMyTurn = !!viewerSchoolId && viewerSchoolId === activeSchoolId;
  const phase = snapshot?.phase ?? "LOBBY";
  const status = snapshot?.status ?? "DRAFT";
  const soundEnabled = soundOn && (snapshot?.flow.sound ?? true);

  // sound feedback: my turn starts, verdict on my answer, match start
  useEffect(() => {
    if (!snapshot) return;
    const prev = soundRef.current;
    if (prev.status && prev.status !== "LIVE" && snapshot.status === "LIVE") {
      playSound("start", soundEnabled);
    }
    if (
      prev.turn !== undefined &&
      prev.turn !== snapshot.turn.counter &&
      snapshot.status === "LIVE" &&
      snapshot.phase !== "RESULT" &&
      snapshot.phase !== "ENDED" &&
      snapshot.turn.activeSchoolId === viewerSchoolId
    ) {
      playSound("turn", soundEnabled);
    }
    const resultKey =
      snapshot.phase === "RESULT" && snapshot.lastResult
        ? snapshot.lastResult.matchQuestionId
        : undefined;
    if (
      resultKey &&
      prev.resultKey !== resultKey &&
      snapshot.lastResult?.schoolId === viewerSchoolId
    ) {
      playSound(
        snapshot.lastResult?.verdict === "CORRECT" ? "correct" : "wrong",
        soundEnabled
      );
    }
    soundRef.current = {
      status: snapshot.status,
      turn: snapshot.turn.counter,
      resultKey,
    };
  }, [snapshot, soundEnabled, viewerSchoolId]);

  const mySchool = useMemo(
    () => snapshot?.schools.find((s) => s.schoolId === viewerSchoolId) ?? null,
    [snapshot, viewerSchoolId]
  );

  const canSelect =
    isMyTurn && phase === "SELECTION" && status === "LIVE" && snapshot?.selectionMethod !== "GM_ASSIGNED";
  const canAnswer = isMyTurn && phase === "ANSWERING" && !!snapshot?.activeQuestion.revealed;
  const attemptsMax = snapshot?.attemptsMax ?? 1;
  // the server judged the earlier attempt wrong but left the question open —
  // the school may try again (a pending/manual verdict keeps phase JUDGING)
  const canRetry =
    canAnswer && phase === "ANSWERING" && attemptsUsed > 0 && attemptsUsed < attemptsMax;
  const alreadySubmitted = !!receipt && !canRetry;

  async function pick(matchQuestionId: string) {
    if (selecting) return;
    setSelecting(true);
    try {
      await send({ type: "QUESTION_SELECT", matchQuestionId });
    } finally {
      setSelecting(false);
    }
  }

  /** One submission at a time; failed sends keep the text so it can be retried. */
  async function submitAnswer(text: string, shownAs?: string) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const snap = await send({ type: "ANSWER_SUBMIT", text });
      if (snap) {
        setReceipt(shownAs ?? text);
        setAnswer("");
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function submit() {
    const text = answer.trim();
    if (!text) return;
    await submitAnswer(text);
  }

  if (!matchId || !snapshot) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-muted">
        {error ? (
          <div className="text-center">
            <div className="mb-2 font-semibold text-bad">Connection problem</div>
            <div className="text-sm">{error}</div>
            <button className="btn btn-ghost mt-4" onClick={() => location.reload()}>
              Retry
            </button>
          </div>
        ) : (
          "Connecting…"
        )}
      </div>
    );
  }

  // ── ended ────────────────────────────────────────────────
  if (phase === "ENDED" || status === "COMPLETED") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-2xl font-bold">Match Complete</div>
        <div className="text-muted">Thank you for playing, {mySchool?.name}.</div>
        <div className="panel mt-4 px-6 py-5 sm:px-8">
          <div className="text-xs tracking-widest text-muted uppercase">Your score</div>
          <div className="mt-1 text-4xl font-black">{mySchool?.score ?? 0}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-5">
      {/* header: identity + connection */}
      <div className="panel flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-bold tracking-widest text-muted uppercase">
            {snapshot.competition.name}
          </div>
          <div className="truncate text-lg font-bold">{mySchool?.abbreviation ?? mySchool?.name ?? "…"}</div>
          {snapshot.activeCategory && (
            <div className="truncate text-[11px] font-semibold text-accent">
              Category: {snapshot.activeCategory.name}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs">
          <button
            onClick={() => {
              unlockAudio();
              const next = !soundOn;
              setSoundOn(next);
              writeSoundPref(next);
            }}
            className="rounded-md border border-line px-3 py-2 font-bold text-muted hover:text-foreground"
          >
            {soundOn ? "Sound on" : "Muted"}
          </button>
          <span className={connected ? "live-dot" : "w-2.5 h-2.5 rounded-full bg-bad"} />
          <span className="text-muted">{connected ? "Online" : "Reconnecting…"}</span>
        </div>
      </div>

      {/* turn banner */}
      <div
        className={`panel px-4 py-3 text-center text-sm font-bold ${
          isMyTurn && status === "LIVE" ? "border-accent/60 text-accent" : ""
        }`}
      >
        {status === "PAUSED" ? (
          "Match paused — please wait"
        ) : snapshot.breakActive ? (
          "Break — enjoy the show!"
        ) : phase === "SELECTION" ? (
          isMyTurn ? (
            "YOUR TURN — pick a question"
          ) : (
            `Waiting for ${snapshot.schools.find((s) => s.schoolId === activeSchoolId)?.name ?? "the next school"}…`
          )
        ) : phase === "ANSWERING" || phase === "JUDGING" ? (
          isMyTurn ? (
            "YOUR TURN — answer the question"
          ) : (
            `${snapshot.schools.find((s) => s.schoolId === activeSchoolId)?.name ?? "A school"} is answering…`
          )
        ) : (
          "Waiting for the officials…"
        )}
      </div>

      {/* timer */}
      {(snapshot.timer.status === "RUNNING" || snapshot.timer.status === "PAUSED") && (
        <div className="panel flex items-center justify-center py-4">
          <TimerRing
            timer={snapshot.timer}
            size={168}
            sound={soundEnabled}
            label={snapshot.timer.status === "PAUSED" ? "Paused" : "Time"}
          />
        </div>
      )}

      {/* break banner */}
      {snapshot.breakActive && (
        <div className="panel border-accent/50 bg-accent/10 px-4 py-4 text-center">
          <div className="text-lg font-black text-accent">☕ Break time</div>
          <div className="mt-1 text-sm text-muted">
            Enjoy the show — the match resumes shortly.
          </div>
        </div>
      )}

      {/* pre-game instructions */}
      {phase === "LOBBY" && (
        <div className="panel qcard-in p-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-lg">📋</span>
            <span className="text-sm font-black tracking-widest text-accent uppercase">
              How it works
            </span>
          </div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {snapshot.competition.rules?.trim()
              ? snapshot.competition.rules
              : "Each school takes turns picking a question from the board and answering it. Correct answers score the points shown on the board. Listen to the Game Master, answer fast, and good luck!"}
          </div>
          {snapshot.competition.format && (
            <div className="mt-3 border-t border-line pt-2 text-xs text-muted">
              Format: <b className="text-foreground">{FORMAT_LABELS[snapshot.competition.format] ?? snapshot.competition.format}</b>
            </div>
          )}
        </div>
      )}

      {/* selection board — one category at a time, numbered */}
      {phase === "SELECTION" && (
        <div className="panel p-3">
          <CategoryBoard
            cells={snapshot.board}
            categoryOrder={snapshot.availableCategories.map((c) => c.id)}
            onPick={canSelect ? (id) => void pick(id) : undefined}
            disabled={selecting}
          />
          {snapshot.selectionMethod === "GM_ASSIGNED" && (
            <div className="mt-2 text-center text-sm text-muted">
              Questions are assigned by the Game Master.
            </div>
          )}
        </div>
      )}

      {/* active question */}
      {snapshot.activeQuestion.revealed && snapshot.activeQuestion.text && (
        <div className="panel qcard-in p-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-bold tracking-widest text-muted uppercase">
              {snapshot.activeQuestion.categoryName ?? snapshot.competition.name}
            </span>
            <span className="chip chip-ready">
              {snapshot.activeQuestion.pointValue} pts
              {snapshot.activeQuestion.isBonus && snapshot.activeQuestion.bonusPoints
                ? ` + ${snapshot.activeQuestion.bonusPoints} bonus`
                : ""}
            </span>
          </div>
          <div className="text-lg font-semibold">
            <MathText>{snapshot.activeQuestion.text}</MathText>
          </div>

          {canAnswer && !alreadySubmitted && (
            <div className="mt-4">
              {snapshot.activeQuestion.type === "MULTIPLE_CHOICE" &&
                snapshot.activeQuestion.options && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {snapshot.activeQuestion.options.map((opt, i) => (
                      <button
                        key={opt.id}
                        disabled={submitting}
                        onClick={() => {
                          setChosenId(opt.id);
                          void submitAnswer(opt.id, opt.text);
                        }}
                        className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all active:scale-[0.98] ${
                          chosenId === opt.id
                            ? "border-accent bg-accent/15"
                            : "border-line hover:border-accent/50 bg-panel-2 hover:bg-panel"
                        }`}
                        style={{ fontSize: "clamp(1rem, 2vw, 1.35rem)", fontWeight: 600 }}
                      >
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-black"
                          style={{
                            backgroundColor: chosenId === opt.id ? "var(--accent)" : "rgba(255, 210, 74, 0.2)",
                            color: chosenId === opt.id ? "#1a1204" : "var(--accent)",
                          }}
                        >
                          {String.fromCharCode(65 + i)}
                        </span>
                        <MathText className="flex-1">{opt.text}</MathText>
                      </button>
                    ))}
                  </div>
                )}
              {snapshot.activeQuestion.type === "TRUE_FALSE" && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {["True", "False"].map((v) => (
                    <button
                      key={v}
                      disabled={submitting}
                      onClick={() => void submitAnswer(v)}
                      className="flex items-center gap-4 rounded-2xl border-2 border-line bg-panel-2 p-4 text-left transition-all active:scale-[0.98] hover:border-accent/50"
                      style={{ fontSize: "clamp(1.1rem, 2.2vw, 1.5rem)", fontWeight: 600 }}
                    >
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-full"
                        style={{ backgroundColor: "rgba(255, 210, 74, 0.2)", color: "var(--accent)", fontWeight: "bold" }}
                      >
                        {v[0]}
                      </span>
                      <MathText>{v}</MathText>
                    </button>
                  ))}
                </div>
              )}
              {(snapshot.activeQuestion.type === "SHORT_TEXT" ||
                snapshot.activeQuestion.type === "NUMERICAL" ||
                snapshot.activeQuestion.type === "SUBJECTIVE") && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    className="input min-w-0 flex-1"
                    placeholder={
                      snapshot.activeQuestion.type === "NUMERICAL" ? "Numeric answer" : "Your answer"
                    }
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void submit()}
                    maxLength={2000}
                  />
                  <button
                    className="btn btn-primary sm:shrink-0"
                    onClick={() => void submit()}
                    disabled={!answer.trim() || submitting}
                  >
                    {submitting ? "Sending…" : "Submit"}
                  </button>
                </div>
              )}
            </div>
          )}

          {alreadySubmitted && (
            <div className="mt-4 rounded-lg border border-good/40 bg-good/10 px-3 py-3 text-sm">
              <div className="font-bold text-good">✓ Answer submitted</div>
              <div className="mt-1 text-muted">
                “{receipt}” — waiting for the officials.
              </div>
            </div>
          )}
        </div>
      )}

      {/* result (only after authorized reveal) — animated verdict */}
      {phase === "RESULT" && snapshot.lastResult && (
        <div
          className={`panel relative overflow-hidden p-4 text-center sm:p-6 ${
            snapshot.lastResult.verdict === "CORRECT"
              ? "border-good/60"
              : "border-bad/40"
          }`}
        >
          {snapshot.lastResult.verdict === "CORRECT" && <span className="burst-ring" />}
          <div
            className={`verdict-pop text-3xl font-black ${
              snapshot.lastResult.verdict === "CORRECT" ? "text-good" : "verdict-shake text-bad"
            }`}
          >
            {snapshot.lastResult.verdict === "CORRECT" ? "✓ CORRECT!" : "✗ INCORRECT"}
          </div>
          {snapshot.lastResult.pointsAwarded !== 0 && (
            <div
              className={`verdict-pop mt-2 text-2xl font-black ${
                snapshot.lastResult.pointsAwarded > 0 ? "text-good" : "text-bad"
              }`}
              style={{ animationDelay: "0.2s" }}
            >
              {snapshot.lastResult.pointsAwarded > 0 ? "+" : ""}
              {snapshot.lastResult.pointsAwarded} points
            </div>
          )}
          {snapshot.lastResult.answerText && (
            <div className="mt-3 text-sm text-muted">
              Your answer: <MathText className="font-bold">{snapshot.lastResult.answerText}</MathText>
            </div>
          )}
          {snapshot.lastResult.correctAnswer && (
            <div className="mt-1 text-sm">
              Correct answer:{" "}
              <MathText className="font-bold text-good">{snapshot.lastResult.correctAnswer}</MathText>
            </div>
          )}
          {snapshot.lastResult.explanation && (
            <div className="mt-2 text-sm text-muted">
              <MathText>{snapshot.lastResult.explanation}</MathText>
            </div>
          )}
          {snapshot.autoAdvanceAtMs && (
            <AutoAdvancePill
              className="mt-4"
              atMs={snapshot.autoAdvanceAtMs}
              totalSec={snapshot.flow.autoAdvanceSec}
              serverTimeMs={snapshot.timer.serverTimeMs}
            />
          )}
        </div>
      )}

      {/* scores / leaderboard when visible */}
      {snapshot.leaderboardVisible && snapshot.leaderboard && (
        <div className="panel p-4">
          <div className="mb-2 text-xs font-bold tracking-widest text-muted uppercase">Standings</div>
          <div className="flex flex-col gap-1.5">
            {snapshot.leaderboard.map((row) => (
              <div
                key={row.schoolId}
                className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ${
                  row.schoolId === viewerSchoolId ? "bg-accent/10 font-bold" : ""
                }`}
              >
                <span>
                  <span className="mr-2 text-muted">{row.rank}</span>
                  {row.abbreviation ?? row.name}
                </span>
                <span className="font-mono font-bold">{row.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-center text-sm text-bad">
          {error}
        </div>
      )}
    </div>
  );
}
