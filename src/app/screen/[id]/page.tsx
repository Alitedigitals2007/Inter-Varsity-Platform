"use client";

// Main competition screen (spec §3.3): designed for a projector / LED wall.
// Large type, high contrast, minimal clutter, full-screen presentation mode.
// Read-only — the audience cannot control gameplay from this screen.
//
// Before the match (and after it ends) this screen plays the live show:
// animated branding, team cards, sponsor rotation, countdown, ticker —
// composed by the admin in /admin/show, with built-in defaults.

import { use, useEffect, useRef, useState } from "react";
import { useMatchRealtime } from "@/lib/realtime";
import { AutoAdvancePill, TimerRing } from "@/components/Countdown";
import { playSound, readSoundPref, unlockAudio, writeSoundPref } from "@/lib/sound";
import ShowStage, { type StageSegment } from "@/components/stage/ShowStage";
import Leaderboard from "@/components/stage/Leaderboard";
import CategoryBoard from "@/components/CategoryBoard";
import MathText from "@/components/MathText";

type ShowData = {
  competition: {
    name: string;
    logoUrl: string | null;
    venue: string | null;
    edition: string | null;
    startsAt: string | null;
    rules: string | null;
  };
  round: string;
  matchNumber: number;
  schools: {
    schoolId: string;
    turnOrder: number;
    name: string;
    abbreviation: string | null;
    logoUrl: string | null;
  }[];
  sponsors: {
    brandName: string;
    logoUrl: string | null;
    website: string | null;
    description: string | null;
    brandColors: Record<string, string> | null;
    tier: string | null;
  }[];
  segments: StageSegment[];
  defaults: boolean;
};

export default function ScreenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { snapshot, connected } = useMatchRealtime(id);
  const [chrome, setChrome] = useState(true);
  const [show, setShow] = useState<ShowData | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const soundRef = useRef<{ status?: string; turn?: number; resultKey?: string }>({});

  useEffect(() => setSoundOn(readSoundPref()), []);
  const soundEnabled = soundOn && (snapshot?.flow.sound ?? true);

  // live sound effects: match start, new turn, verdict chime
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
      snapshot.phase !== "RESULT"
    ) {
      playSound("turn", soundEnabled);
    }
    const resultKey =
      snapshot.phase === "RESULT" && snapshot.lastResult
        ? snapshot.lastResult.matchQuestionId
        : undefined;
    if (resultKey && prev.resultKey !== resultKey) {
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
  }, [snapshot, soundEnabled]);

  // live-show configuration (stable during an event; refetch on mount)
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/matches/${id}/show`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json?.ok) setShow(json.data as ShowData);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  // hide cursor + chrome after inactivity for a clean venue display
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const wake = () => {
      setChrome(true);
      clearTimeout(timer);
      timer = setTimeout(() => setChrome(false), 4000);
    };
    wake();
    window.addEventListener("mousemove", wake);
    return () => {
      window.removeEventListener("mousemove", wake);
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    // Browsers reject fullscreen without a user gesture — try immediately,
    // then retry on the venue operator's first click or keypress.
    const tryFullscreen = () => {
      if (document.fullscreenElement) return;
      document.documentElement.requestFullscreen?.().catch(() => {});
    };
    const onGesture = () => {
      tryFullscreen();
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
    tryFullscreen();
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, []);

  const phase = snapshot?.phase;
  const ended =
    snapshot && (snapshot.status === "COMPLETED" || snapshot.status === "ARCHIVED");
  // priority: GM break → end-of-round (leaderboard toggle, else break show) →
  // pre-match lobby → live leaderboard → game
  const stageMode: "pre" | "break" | "overlays" | "leaderboard" =
    !snapshot
      ? "pre"
      : snapshot.breakActive
        ? "break"
        : ended
          ? snapshot.leaderboardVisible && snapshot.leaderboard
            ? "leaderboard"
            : "break"
          : phase === "LOBBY"
            ? "pre"
            : snapshot.leaderboardVisible && snapshot.leaderboard
              ? "leaderboard"
              : "overlays";

  const stageProps =
    show &&
    stageMode !== "leaderboard" && (
      <ShowStage
        mode={stageMode}
      competitionName={show.competition.name}
      competitionLogoUrl={show.competition.logoUrl}
      venue={show.competition.venue}
      edition={show.competition.edition}
      startsAt={show.competition.startsAt}
      rules={show.competition.rules}
      round={show.round}
      matchNumber={show.matchNumber}
      schools={show.schools}
      sponsors={show.sponsors}
      segments={show.segments}
      defaults={show.defaults}
    />
  );

  // ── pre-match / break / ended: the live show owns the screen ──
  if (stageMode !== "overlays" && stageMode !== "leaderboard") {
    return (
      <div className="relative flex min-h-dvh flex-col overflow-hidden">
        {stageProps ?? (
          <>
            <div className="stage-backdrop" />
            <div className="relative z-10 flex flex-1 items-center justify-center text-2xl text-muted">
              Preparing the arena…
            </div>
          </>
        )}
        <div
          className={`absolute bottom-4 left-4 z-30 flex items-center gap-2 text-sm transition-opacity ${
            chrome ? "opacity-100" : "opacity-0"
          } ${connected ? "text-muted" : "text-bad"}`}
        >
          <span className={connected ? "live-dot" : "h-2.5 w-2.5 rounded-full bg-bad"} />
          {connected ? "Live" : "Reconnecting…"}
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex flex-1 items-center justify-center text-2xl text-muted">
        Waiting for match data…
      </div>
    );
  }

  // ── live leaderboard: full-screen animated takeover ──
  if (stageMode === "leaderboard" && snapshot.leaderboard) {
    return (
      <div className="relative">
        <Leaderboard entries={snapshot.leaderboard} />
        <div
          className={`absolute bottom-4 left-4 z-30 flex items-center gap-2 text-sm transition-opacity ${
            chrome ? "opacity-100" : "opacity-0"
          } ${connected ? "text-muted" : "text-bad"}`}
        >
          <span className={connected ? "live-dot" : "h-2.5 w-2.5 rounded-full bg-bad"} />
          {connected ? "Live" : "Reconnecting…"}
        </div>
      </div>
    );
  }

  const activeSchool = snapshot.schools.find((s) => s.schoolId === snapshot.turn.activeSchoolId);
  const showBoard = phase === "SELECTION" && !snapshot.activeQuestion.matchQuestionId;
  const showQuestion = snapshot.activeQuestion.revealed && snapshot.activeQuestion.text;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      {/* full-bleed verdict flash */}
      {phase === "RESULT" && snapshot.lastResult && (
        <div
          key={snapshot.lastResult.matchQuestionId}
          className={`pointer-events-none absolute inset-0 z-20 ${
            snapshot.lastResult.verdict === "CORRECT" ? "result-flash-good" : "result-flash-bad"
          }`}
        />
      )}

      {/* live-show overlays: sponsor bug + animated border */}
      <div className="pointer-events-none absolute inset-0 z-30">{stageProps}</div>

      {/* top bar: competition + round + status */}
<header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-6 md:px-10 md:py-5">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          {snapshot.competition.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={snapshot.competition.logoUrl} alt="" className="h-9 w-9 rounded-lg object-contain sm:h-12 sm:w-12" />
          )}
          <div className="min-w-0">
            <div className="truncate text-lg font-black tracking-tight sm:text-2xl lg:text-3xl">{snapshot.competition.name}</div>
            <div className="truncate text-xs text-muted sm:text-base lg:text-lg">
              Match {snapshot.matchNumber} · Turn {snapshot.turn.counter}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:gap-6">
          {snapshot.status === "LIVE" && (
            <span className="flex items-center gap-2 text-sm font-bold text-good sm:text-xl">
              <span className="live-dot !h-3 !w-3" /> LIVE
            </span>
          )}
          {snapshot.status === "PAUSED" && (
            <span className="rounded-full bg-warn px-3 py-1 text-sm font-black text-black sm:px-4 sm:text-xl">PAUSED</span>
          )}
          <span className="text-base font-bold text-muted sm:text-2xl">Turn {snapshot.turn.counter}</span>
          {snapshot.activeCategory?.name && (
            <span className="text-xs text-muted sm:text-sm">· {snapshot.activeCategory.name}</span>
          )}
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-5 text-center sm:px-8 sm:py-8 md:px-12">
        {/* now playing */}
        {activeSchool && (
          <div className="mb-4 sm:mb-6">
            <div className="text-sm font-bold tracking-[0.3em] text-accent uppercase sm:text-xl">Now Playing</div>
            <div className="mt-1 text-3xl font-black tracking-tight sm:text-5xl lg:text-6xl">{activeSchool.name}</div>
          </div>
        )}

        {/* status text when nothing is revealed */}
        {phase === "SELECTION" && !showQuestion && (
          <div className="text-xl font-bold text-muted sm:text-3xl lg:text-4xl">
            {activeSchool ? `${activeSchool.abbreviation ?? activeSchool.name} is choosing a question…` : "Waiting for the next turn…"}
          </div>
        )}
        {phase === "JUDGING" && <div className="text-xl font-bold text-warn sm:text-3xl lg:text-4xl">Judging…</div>}
        {phase === "AWAITING_REVEAL" && <div className="text-xl font-bold text-muted sm:text-3xl lg:text-4xl">Answer submitted</div>}

        {/* question board — one category at a time, numbered */}
        {showBoard && (
          <div className="qcard-in w-full max-w-5xl">
            <CategoryBoard cells={snapshot.board} size="lg" />
          </div>
        )}

        {/* question text + options */}
        {showQuestion && (
          <div className="qcard-in w-full max-w-6xl">
            <div className="mb-3 flex flex-wrap items-center justify-center gap-2 sm:mb-4 sm:gap-4">
              <span className="rounded-full bg-accent-2/20 px-4 py-1.5 text-sm font-bold text-accent-2 sm:px-6 sm:text-xl">
                {snapshot.activeCategory?.name ?? snapshot.activeQuestion.categoryName}
              </span>
              <span className="rounded-full bg-accent/20 px-4 py-1.5 text-sm font-black text-accent sm:px-6 sm:text-xl">
                {snapshot.activeQuestion.pointValue} pts
              </span>
            </div>
            <div
              className="font-black leading-tight tracking-tight"
              style={{ fontSize: "clamp(1.35rem, 4.2vw, 3.8rem)" }}
            >
              <MathText>{snapshot.activeQuestion.text}</MathText>
            </div>
            {snapshot.activeQuestion.options && (
              <div className="mx-auto mt-5 grid max-w-4xl gap-3 sm:mt-8 sm:grid-cols-2 sm:gap-4">
                {snapshot.activeQuestion.options.map((o, i) => (
                  <div
                    key={o.id}
                    className="flex items-center gap-3 rounded-2xl border-2 border-line bg-panel px-4 py-3 text-left sm:gap-4 sm:px-7 sm:py-5"
                    style={{ fontSize: "clamp(1rem, 2vw, 1.7rem)", fontWeight: 700 }}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20 font-black text-accent sm:h-9 sm:w-9">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <MathText className="flex-1">{o.text}</MathText>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* result announcement — animated verdict */}
        {phase === "RESULT" && snapshot.lastResult && (
          <div className="relative mt-4">
            {snapshot.lastResult.verdict === "CORRECT" && <span className="burst-ring" />}
            <div
              className={`verdict-pop text-4xl font-black tracking-tight sm:text-7xl lg:text-8xl ${
                snapshot.lastResult.verdict === "CORRECT"
                  ? "text-good"
                  : "verdict-shake text-bad"
              }`}
            >
              {snapshot.lastResult.verdict === "CORRECT" ? "✓ CORRECT!" : "✗ INCORRECT"}
            </div>
            {snapshot.lastResult.pointsAwarded !== 0 && (
              <div
                className="verdict-pop mt-2 text-3xl font-black sm:text-5xl"
                style={{ animationDelay: "0.2s" }}
              >
                {snapshot.lastResult.pointsAwarded > 0 ? "+" : ""}
                {snapshot.lastResult.pointsAwarded} points
              </div>
            )}
            {snapshot.lastResult.answerText && (
              <div className="mt-3 text-lg text-muted sm:mt-4 sm:text-3xl">
                Answer: <MathText className="font-bold text-foreground">{snapshot.lastResult.answerText}</MathText>
              </div>
            )}
            {snapshot.lastResult.correctAnswer && (
              <div className="mt-2 text-lg sm:text-3xl">
                Correct answer: <MathText className="font-bold text-good">{snapshot.lastResult.correctAnswer}</MathText>
              </div>
            )}
            {snapshot.lastResult.explanation && (
              <div className="mx-auto mt-3 max-w-3xl text-base text-muted sm:mt-4 sm:text-2xl">
                <MathText>{snapshot.lastResult.explanation}</MathText>
              </div>
            )}
            {snapshot.autoAdvanceAtMs && (
              <AutoAdvancePill
                className="mt-6"
                atMs={snapshot.autoAdvanceAtMs}
                totalSec={snapshot.flow.autoAdvanceSec}
                serverTimeMs={snapshot.timer.serverTimeMs}
              />
            )}
          </div>
        )}

        {/* leaderboard */}
        {snapshot.leaderboardVisible && snapshot.leaderboard && (
          <div className="mt-8 w-full max-w-3xl sm:mt-10">
            <div className="mb-3 text-base font-black tracking-[0.3em] text-muted uppercase sm:text-xl">Standings</div>
            <div className="flex flex-col gap-2">
              {snapshot.leaderboard.map((row) => (
                <div key={row.schoolId} className="flex items-center justify-between rounded-xl border border-line bg-panel px-3 py-2 sm:px-6 sm:py-3">
                  <span className="flex items-center gap-3 text-lg font-black sm:gap-4 sm:text-3xl">
                    <span className="w-6 text-right text-muted sm:w-10">{row.rank}</span>
                    {row.abbreviation ?? row.name}
                    {row.categoryScores && (
                      <span className="text-xs text-accent">
                        (Category: {row.categoryScores[snapshot.activeCategory?.id ?? ""]})
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-lg font-black sm:text-3xl">{row.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* bottom bar: timer + connection */}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-6 md:px-10 md:py-4">
        <div className={`flex items-center gap-2 text-sm sm:text-lg ${connected ? "text-muted" : "text-bad"}`}>
          <span className={connected ? "live-dot" : "h-3 w-3 rounded-full bg-bad"} />
          {connected ? "Connected" : "Reconnecting…"}
        </div>
        {(snapshot.timer.status === "RUNNING" || snapshot.timer.status === "PAUSED") && (
          <TimerRing
            timer={snapshot.timer}
            size={132}
            sound={soundEnabled}
            label={snapshot.timer.status === "PAUSED" ? "Paused" : "Time"}
          />
        )}
        <div className="text-sm text-muted sm:text-lg">
          {snapshot.competition.edition ?? ""}
        </div>
      </footer>

      {/* corner controls hint, auto-hidden */}
      <div className={`absolute right-4 bottom-4 z-40 flex items-center gap-3 transition-opacity ${chrome ? "opacity-100" : "opacity-0"}`}>
        <button
          onClick={() => {
            unlockAudio();
            const next = !soundOn;
            setSoundOn(next);
            writeSoundPref(next);
          }}
          className="rounded-md border border-line bg-panel/80 px-3 py-1 text-xs font-bold text-muted hover:text-foreground"
        >
          {soundOn ? "Sound on" : "Muted"}
        </button>
        <span className="hidden text-xs text-muted/40 sm:inline">press Esc to exit full screen</span>
      </div>
    </div>
  );
}
