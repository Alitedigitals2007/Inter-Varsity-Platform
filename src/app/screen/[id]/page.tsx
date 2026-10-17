"use client";

// Main competition screen (spec §3.3): designed for a projector / LED wall.
// Large type, high contrast, minimal clutter, full-screen presentation mode.
// Read-only — the audience cannot control gameplay from this screen.
//
// Before the match (and after it ends) this screen plays the live show:
// animated branding, team cards, sponsor rotation, countdown, ticker —
// composed by the admin in /admin/show, with built-in defaults.

import { use, useEffect, useState } from "react";
import { useMatchRealtime } from "@/lib/realtime";
import { Countdown } from "@/components/Countdown";
import ShowStage, { type StageSegment } from "@/components/stage/ShowStage";
import Leaderboard from "@/components/stage/Leaderboard";
import CategoryBoard from "@/components/CategoryBoard";

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
  sponsors: { brandName: string; logoUrl: string | null }[];
  segments: StageSegment[];
  defaults: boolean;
};

export default function ScreenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { snapshot, connected } = useMatchRealtime(id);
  const [chrome, setChrome] = useState(true);
  const [show, setShow] = useState<ShowData | null>(null);

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
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  const phase = snapshot?.phase;
  const ended =
    snapshot && (snapshot.status === "COMPLETED" || snapshot.status === "ARCHIVED");
  // priority: GM break → ended → pre-match lobby → live leaderboard → game
  const stageMode: "pre" | "break" | "overlays" | "leaderboard" =
    !snapshot
      ? "pre"
      : snapshot.breakActive || ended
        ? "break"
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
      <div className="relative flex min-h-screen flex-col overflow-hidden">
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
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      {/* live-show overlays: sponsor bug + animated border */}
      <div className="pointer-events-none absolute inset-0 z-30">{stageProps}</div>

      {/* top bar: competition + round + status */}
      <header className="flex items-center justify-between border-b border-line px-10 py-5">
        <div className="flex items-center gap-4">
          {snapshot.competition.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={snapshot.competition.logoUrl} alt="" className="h-12 w-12 rounded-lg object-contain" />
          )}
          <div>
            <div className="text-3xl font-black tracking-tight">{snapshot.competition.name}</div>
            <div className="text-lg text-muted">
              {snapshot.round.name} · Match {snapshot.matchNumber}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          {snapshot.status === "LIVE" && (
            <span className="flex items-center gap-2 text-xl font-bold text-good">
              <span className="live-dot !h-3 !w-3" /> LIVE
            </span>
          )}
          {snapshot.status === "PAUSED" && (
            <span className="rounded-full bg-warn px-4 py-1 text-xl font-black text-black">PAUSED</span>
          )}
          <span className="text-2xl font-bold text-muted">Turn {snapshot.turn.counter}</span>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-12 py-8 text-center">
        {/* now playing */}
        {activeSchool && (
          <div className="mb-6">
            <div className="text-xl font-bold tracking-[0.3em] text-accent uppercase">Now Playing</div>
            <div className="mt-1 text-6xl font-black tracking-tight">{activeSchool.name}</div>
          </div>
        )}

        {/* status text when nothing is revealed */}
        {phase === "SELECTION" && !showQuestion && (
          <div className="text-4xl font-bold text-muted">
            {activeSchool ? `${activeSchool.abbreviation ?? activeSchool.name} is choosing a question…` : "Waiting for the next turn…"}
          </div>
        )}
        {phase === "JUDGING" && <div className="text-4xl font-bold text-warn">Judging…</div>}
        {phase === "AWAITING_REVEAL" && <div className="text-4xl font-bold text-muted">Answer submitted</div>}

        {/* question board — one category at a time, numbered */}
        {showBoard && (
          <div className="qcard-in w-full max-w-5xl">
            <CategoryBoard cells={snapshot.board} size="lg" />
          </div>
        )}

        {/* question text + options */}
        {showQuestion && (
          <div className="qcard-in w-full max-w-6xl">
            <div className="mb-4 flex items-center justify-center gap-4">
              <span className="rounded-full bg-accent-2/20 px-6 py-1.5 text-xl font-bold text-accent-2">
                {snapshot.activeQuestion.categoryName}
              </span>
              <span className="rounded-full bg-accent/20 px-6 py-1.5 text-xl font-black text-accent">
                {snapshot.activeQuestion.pointValue} pts
              </span>
            </div>
            <div
              className="font-black leading-tight tracking-tight"
              style={{ fontSize: "clamp(1.7rem, 4.2vw, 3.8rem)" }}
            >
              {snapshot.activeQuestion.text}
            </div>
            {snapshot.activeQuestion.options && (
              <div className="mx-auto mt-8 grid max-w-4xl gap-4 sm:grid-cols-2">
                {snapshot.activeQuestion.options.map((o, i) => (
                  <div
                    key={o.id}
                    className="flex items-center gap-4 rounded-2xl border-2 border-line bg-panel px-7 py-5 text-left"
                    style={{ fontSize: "clamp(1rem, 2vw, 1.7rem)", fontWeight: 700 }}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/20 font-black text-accent">
                      {String.fromCharCode(65 + i)}
                    </span>
                    {o.text}
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
              className={`verdict-pop text-7xl font-black tracking-tight sm:text-8xl ${
                snapshot.lastResult.verdict === "CORRECT"
                  ? "text-good"
                  : "verdict-shake text-bad"
              }`}
            >
              {snapshot.lastResult.verdict === "CORRECT" ? "✓ CORRECT!" : "✗ INCORRECT"}
            </div>
            {snapshot.lastResult.pointsAwarded !== 0 && (
              <div
                className="verdict-pop mt-2 text-5xl font-black"
                style={{ animationDelay: "0.2s" }}
              >
                {snapshot.lastResult.pointsAwarded > 0 ? "+" : ""}
                {snapshot.lastResult.pointsAwarded} points
              </div>
            )}
            {snapshot.lastResult.answerText && (
              <div className="mt-4 text-3xl text-muted">
                Answer: <span className="font-bold text-foreground">{snapshot.lastResult.answerText}</span>
              </div>
            )}
            {snapshot.lastResult.correctAnswer && (
              <div className="mt-2 text-3xl">
                Correct answer: <span className="font-bold text-good">{snapshot.lastResult.correctAnswer}</span>
              </div>
            )}
            {snapshot.lastResult.explanation && (
              <div className="mx-auto mt-4 max-w-3xl text-2xl text-muted">{snapshot.lastResult.explanation}</div>
            )}
          </div>
        )}

        {/* leaderboard */}
        {snapshot.leaderboardVisible && snapshot.leaderboard && (
          <div className="mt-10 w-full max-w-3xl">
            <div className="mb-3 text-xl font-black tracking-[0.3em] text-muted uppercase">Standings</div>
            <div className="flex flex-col gap-2">
              {snapshot.leaderboard.map((row) => (
                <div key={row.schoolId} className="flex items-center justify-between rounded-xl border border-line bg-panel px-6 py-3">
                  <span className="flex items-center gap-4 text-3xl font-black">
                    <span className="w-10 text-right text-muted">{row.rank}</span>
                    {row.abbreviation ?? row.name}
                  </span>
                  <span className="font-mono text-3xl font-black">{row.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* bottom bar: timer + connection */}
      <footer className="flex items-center justify-between border-t border-line px-10 py-4">
        <div className={`flex items-center gap-2 text-lg ${connected ? "text-muted" : "text-bad"}`}>
          <span className={connected ? "live-dot" : "h-3 w-3 rounded-full bg-bad"} />
          {connected ? "Connected" : "Reconnecting…"}
        </div>
        {(snapshot.timer.status === "RUNNING" || snapshot.timer.status === "PAUSED") && (
          <div className="flex items-center gap-4">
            <span className="text-lg font-bold tracking-widest text-muted uppercase">Time</span>
            <Countdown timer={snapshot.timer} size="text-6xl" />
          </div>
        )}
        <div className="text-lg text-muted">
          {snapshot.competition.edition ?? ""}
        </div>
      </footer>

      {/* corner controls hint, auto-hidden */}
      <div className={`absolute right-4 bottom-4 text-xs text-muted/40 transition-opacity ${chrome ? "opacity-100" : "opacity-0"}`}>
        press Esc to exit full screen
      </div>
    </div>
  );
}
