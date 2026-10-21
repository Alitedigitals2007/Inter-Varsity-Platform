"use client";

// Game Master dashboard (spec §3.2): run one live match. The server is the
// only writer of state — every button sends a Command and the authoritative
// snapshot comes back. Dangerous actions confirm first; overrides require a
// reason and are audited server-side.

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMatchRealtime } from "@/lib/realtime";
import { AutoAdvancePill, TimerRing } from "@/components/Countdown";
import { playSound, readSoundPref, unlockAudio, writeSoundPref } from "@/lib/sound";
import CategoryBoard from "@/components/CategoryBoard";
import MathText from "@/components/MathText";
import { FORMAT_LABELS } from "@/lib/formats";
import type { MatchSnapshot } from "@/lib/engine/snapshot";
import type { Command } from "@/lib/engine/types";
import { apiGet } from "@/lib/client";

type LiveEventRow = { seq: number; type: string; createdAt: string };

export default function GmMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { snapshot, connected, error, send } = useMatchRealtime(id);

  const [confirming, setConfirming] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [overrideSchool, setOverrideSchool] = useState("");
  const [overridePoints, setOverridePoints] = useState("0");
  const [events, setEvents] = useState<LiveEventRow[]>([]);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [nextMatch, setNextMatch] = useState<{
    id: string;
    matchNumber: number;
    status: string;
    roundName: string;
    schools: string[];
  } | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const soundRef = useRef<{ status?: string; turn?: number; resultKey?: string }>({});

  useEffect(() => setSoundOn(readSoundPref()), []);
  const soundEnabled = soundOn && (snapshot?.flow.sound ?? true);

  // operator feedback: start / new turn / verdict chime
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

  // staff gate: this surface is for ADMIN / GAME_MASTER only
  useEffect(() => {
    apiGet<{ identity: { kind: string; role?: string } }>("/api/auth/me")
      .then((d) => setAuthorized(d.identity?.kind === "STAFF"))
      .catch(() => setAuthorized(false));
  }, []);
  useEffect(() => {
    if (authorized === false) router.replace("/login");
  }, [authorized, router]);

  // event history for the "match event history" panel — keyed to the
  // snapshot version so it also refreshes in polling mode (no Ably events)
  const snapshotVersion = snapshot?.version;
  useEffect(() => {
    if (snapshotVersion === undefined) return;
    apiGet<{ events: LiveEventRow[] }>(`/api/matches/${id}/events?take=40`)
      .then((d) => setEvents(d.events))
      .catch(() => {});
  }, [id, snapshotVersion]);

  // end of round: find the next match in this competition
  const snapshotStatus = snapshot?.status;
  useEffect(() => {
    if (snapshotStatus !== "COMPLETED") return;
    let cancelled = false;
    apiGet<{
      next: { id: string; matchNumber: number; status: string; roundName: string; schools: string[] } | null;
    }>(`/api/matches/${id}/next`)
      .then((d) => {
        if (!cancelled) setNextMatch(d.next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id, snapshotStatus]);

  const phase = snapshot?.phase ?? "LOBBY";
  const status = snapshot?.status ?? "DRAFT";
  const canRun = status === "LIVE" || status === "PAUSED";

  const activeSchool = useMemo(
    () => snapshot?.schools.find((s) => s.schoolId === snapshot.turn.activeSchoolId) ?? null,
    [snapshot]
  );

  if (authorized === null || !snapshot) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted">
        {error ? <span className="text-bad">{error}</span> : "Connecting…"}
      </div>
    );
  }

  async function cmd(command: Parameters<typeof send>[0]) {
    await send(command);
    setConfirming(null);
    setReason("");
  }

  /** End-of-round: break show and leaderboard are mutually exclusive on the
   * venue screen — the server flips them together in one atomic command. */
  async function showOnly(target: "break" | "leaderboard") {
    if (target === "break") {
      await send({ type: "BREAK_SET", visible: true });
    } else {
      await send({ type: "LEADERBOARD_SET", visible: true });
    }
  }

  const nextAction = nextControl(snapshot!);

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-5">
      {/* header */}
      <div className="panel mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <Link href="/gm" className="text-xs font-semibold text-muted hover:text-foreground">
            ← All matches
          </Link>
          <div className="text-lg font-bold">
            {snapshot.competition.name} · Match {snapshot.matchNumber}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`chip ${status === "LIVE" ? "chip-live" : status === "PAUSED" ? "chip-paused" : status === "READY" ? "chip-ready" : "chip-draft"}`}>
            {status}
          </span>
          <span className="chip">{phase}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className={connected ? "live-dot" : "w-2.5 h-2.5 rounded-full bg-bad"} />
            {connected ? "Live" : "Reconnecting…"}
          </span>
          <button
            className="btn btn-ghost"
            onClick={() => {
              unlockAudio();
              const next = !soundOn;
              setSoundOn(next);
              writeSoundPref(next);
            }}
          >
            {soundOn ? "Sound on" : "Muted"}
          </button>
          <button
            className={`btn ${snapshot.breakActive ? "btn-good" : "btn-warn"}`}
            onClick={() => void cmd({ type: "BREAK_SET", visible: !snapshot.breakActive })}
          >
            {snapshot.breakActive ? "End break ▶" : "Break ☕"}
          </button>
          <Link href={`/screen/${snapshot.matchId}`} target="_blank" className="btn btn-ghost">
            Main screen ↗
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── left column: match flow ─────────────────────── */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          {/* turn + school */}
          <div className="panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold tracking-widest text-muted uppercase">Now playing</div>
                <div className="mt-1 text-2xl font-bold">
                  {activeSchool?.name ?? (phase === "LOBBY" ? "Not started" : "—")}
                </div>
                <div className="text-sm text-muted">
                  Turn {snapshot.turn.counter}
                  {snapshot.turn.totalTurns ? ` of ${snapshot.turn.totalTurns}` : ""}
                </div>
              </div>
              <div className="text-center">
                <TimerRing
                  timer={snapshot.timer}
                  size={150}
                  sound={soundEnabled}
                  label={snapshot.timer.status === "PAUSED" ? "Paused" : (snapshot.timer.phase ?? "Timer")}
                />
              </div>
            </div>

            {/* timer controls */}
            {canRun && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                <TimerBtn label="Start" onClick={() => void cmd({ type: "TIMER_SET", action: "START" })} show={snapshot.timer.status === "IDLE" || snapshot.timer.status === "STOPPED" || snapshot.timer.status === "EXPIRED"} />
                <TimerBtn label="Pause" onClick={() => void cmd({ type: "TIMER_SET", action: "PAUSE" })} show={snapshot.timer.status === "RUNNING"} />
                <TimerBtn label="Resume" onClick={() => void cmd({ type: "TIMER_SET", action: "RESUME" })} show={snapshot.timer.status === "PAUSED"} />
                <TimerBtn label="+5s" onClick={() => void cmd({ type: "TIMER_SET", action: "ADD", ms: 5000 })} show={snapshot.timer.status === "RUNNING" || snapshot.timer.status === "PAUSED"} />
                <TimerBtn label="−5s" onClick={() => void cmd({ type: "TIMER_SET", action: "REDUCE", ms: 5000 })} show={snapshot.timer.status === "RUNNING" || snapshot.timer.status === "PAUSED"} />
                <TimerBtn label="Set 30s" onClick={() => void cmd({ type: "TIMER_SET", action: "SET", ms: 30000 })} show />
                <TimerBtn label="Stop" onClick={() => void cmd({ type: "TIMER_SET", action: "STOP" })} show={snapshot.timer.status === "RUNNING" || snapshot.timer.status === "PAUSED"} />
              </div>
            )}
          </div>

          {/* rules & format reminder during lobby */}
          {phase === "LOBBY" && (
            <div className="panel p-4">
              <div className="mb-1 text-xs font-bold tracking-widest text-muted uppercase">
                Rules & format
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {snapshot.competition.rules?.trim() ||
                  "No rules set yet — add them in Admin → Competitions so schools know the format."}
              </div>
              {snapshot.competition.format && (
                <div className="mt-2 border-t border-line pt-2 text-xs text-muted">
                  Format: <b className="text-foreground">{FORMAT_LABELS[snapshot.competition.format] ?? snapshot.competition.format}</b>
                </div>
              )}
            </div>
          )}

          {/* primary flow control */}
          <div className="panel p-4">
            <div className="mb-3 text-xs font-bold tracking-widest text-muted uppercase">Match control</div>

            {status === "DRAFT" || status === "READY" ? (
              <button className="btn btn-good" onClick={() => void cmd({ type: "MATCH_START" })}>
                ▶ Start Match
              </button>
            ) : status === "PAUSED" ? (
              <div className="flex gap-2">
                <button className="btn btn-good" onClick={() => void cmd({ type: "MATCH_RESUME" })}>
                  ▶ Resume Match
                </button>
                <DangerButton label="End match" id="end" confirming={confirming} setConfirming={setConfirming} reason={reason} setReason={setReason} onDo={(r) => void cmd({ type: "MATCH_END", reason: r })} />
              </div>
            ) : status === "LIVE" ? (
              <div className="flex flex-wrap gap-2">
                {nextAction && (
                  <button className={`btn ${nextAction.tone}`} onClick={() => void cmd(nextAction.command)}>
                    {nextAction.label}
                  </button>
                )}
                <button className="btn btn-ghost" onClick={() => void cmd({ type: "MATCH_PAUSE", reason: "gm_pause" })}>
                  ⏸ Pause
                </button>
                {phase === "RESULT" && (
                  <button className="btn btn-ghost" onClick={() => void cmd({ type: "TURN_REPEAT", reason: "gm_repeat" })}>
                    ↺ Repeat turn
                  </button>
                )}
                <DangerButton label="Skip turn" id="skip" confirming={confirming} setConfirming={setConfirming} reason={reason} setReason={setReason} onDo={(r) => void cmd({ type: "TURN_SKIP", reason: r })} />
                <DangerButton label="End match" id="end" confirming={confirming} setConfirming={setConfirming} reason={reason} setReason={setReason} onDo={(r) => void cmd({ type: "MATCH_END", reason: r })} />
              </div>
            ) : (
              <div>
                <div className="mb-1 text-lg font-black">🏁 End of round — {snapshot.round.name}</div>
                <p className="mb-3 text-sm text-muted">
                  {snapshot.competition.name} · final standings for this round. Play the break show, then
                  the leaderboard — or open the next round.
                </p>
                <div className="mb-4 flex flex-col gap-1.5">
                  {[...snapshot.schools]
                    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                    .map((s, i) => (
                      <div
                        key={s.schoolId}
                        className="flex items-center justify-between rounded-md border border-line bg-panel-2 px-3 py-2 text-sm"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="font-mono text-muted">{i + 1}</span>
                          <span className="truncate font-semibold">{s.abbreviation ?? s.name}</span>
                          <span className={qualificationChip(s.qualification)}>{s.qualification || "—"}</span>
                        </span>
                        <span className="font-mono font-bold">{s.score}</span>
                      </div>
                    ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={`btn ${snapshot.breakActive ? "btn-good" : "btn-primary"}`}
                    onClick={() => void showOnly("break")}
                  >
                    🎬 {snapshot.breakActive ? "Break show on" : "Play break show"}
                  </button>
                  <button
                    className={`btn ${snapshot.leaderboardVisible ? "btn-good" : "btn-primary"}`}
                    onClick={() => void showOnly("leaderboard")}
                  >
                    🏆 {snapshot.leaderboardVisible ? "Hide leaderboard" : "Show leaderboard"}
                  </button>
                  {nextMatch && (
                    <Link href={`/gm/${nextMatch.id}`} className="btn btn-good">
                      Next round: {nextMatch.roundName} →
                    </Link>
                  )}
                  <Link href="/gm" className="btn btn-ghost">
                    All matches
                  </Link>
                  <Link href="/admin/show" className="btn btn-ghost">
                    Show Director ↗
                  </Link>
                </div>
                <p className="mt-3 text-xs text-muted">
                  {snapshot.leaderboardVisible
                    ? "The leaderboard is on the venue screen — hide it to bring the break show back."
                    : snapshot.breakActive
                      ? "The break show is playing on the venue screen."
                      : "The venue screen is playing the break show."}
                </p>
              </div>
            )}

            {/* phase hint */}
            <div className="mt-3 text-sm text-muted">{phaseHint(phase, snapshot.activeQuestion.categoryName)}</div>

            {snapshot.autoAdvanceAtMs && (
              <div className="mt-3 border-t border-line pt-3">
                <AutoAdvancePill
                  atMs={snapshot.autoAdvanceAtMs}
                  totalSec={snapshot.flow.autoAdvanceSec}
                  serverTimeMs={snapshot.timer.serverTimeMs}
                  label="Auto-advance"
                />
              </div>
            )}
          </div>

          {/* question board (GM can select on behalf of a school) */}
          {canRun && phase === "SELECTION" && snapshot.board.length > 0 && (
            <div className="panel p-4">
              <div className="mb-2 text-xs font-bold tracking-widest text-muted uppercase">
                Question board {snapshot.selectionMethod === "GM_ASSIGNED" ? "(GM assigns)" : ""}
              </div>
              <GmBoard snapshot={snapshot} onPick={(mqId) => void cmd({ type: "QUESTION_SELECT", matchQuestionId: mqId })} />
            </div>
          )}

          {/* active question + judging */}
          {snapshot.activeQuestion.matchQuestionId && (
            <div className="panel p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold tracking-widest text-muted uppercase">
                  {snapshot.activeQuestion.categoryName}
                </span>
                <span className="chip chip-ready">{snapshot.activeQuestion.pointValue} pts</span>
              </div>

              {snapshot.activeQuestion.revealed ? (
                <>
                  <div className="text-lg font-semibold">
                    <MathText>{snapshot.activeQuestion.text}</MathText>
                  </div>
                  {snapshot.activeQuestion.options && (
                    <div className="mt-2 grid gap-1.5">
                      {snapshot.activeQuestion.options.map((o) => (
                        <div key={o.id} className="rounded-md border border-line bg-panel-2 px-3 py-1.5 text-sm">
                          <MathText>{o.text}</MathText>
                        </div>
                      ))}
                    </div>
                  )}
                  {snapshot.activeQuestion.answerKey && (
                    <div className="mt-3 rounded-md border border-good/40 bg-good/10 px-3 py-2 text-sm">
                      <span className="font-bold text-good">Answer: </span>
                      <MathText>{snapshot.activeQuestion.answerKey}</MathText>
                    </div>
                  )}
                  {snapshot.activeQuestion.explanation && (
                    <div className="mt-2 text-sm text-muted">
                      <MathText>{snapshot.activeQuestion.explanation}</MathText>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-muted">
                  Selected — question text is hidden until you reveal it.
                </div>
              )}

              {/* judging pending answers */}
              {snapshot.pendingAnswers && snapshot.pendingAnswers.length > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <div className="mb-2 text-xs font-bold tracking-widest text-warn uppercase">
                    Awaiting your judgment
                  </div>
                  {snapshot.pendingAnswers.map((a) => (
                    <div key={a.answerId} className="mb-2 rounded-md border border-line bg-panel-2 p-3">
                      <div className="text-sm font-semibold">{a.schoolName}</div>
                      <div className="mt-1 text-sm">
                        “<MathText>{a.text}</MathText>”
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button className="btn btn-good" onClick={() => void cmd({ type: "ANSWER_JUDGE", answerId: a.answerId, verdict: "CORRECT" })}>
                          ✓ Correct
                        </button>
                        <button className="btn btn-bad" onClick={() => void cmd({ type: "ANSWER_JUDGE", answerId: a.answerId, verdict: "INCORRECT" })}>
                          ✗ Incorrect
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* void */}
              {phase !== "ENDED" && (
                <div className="mt-3 border-t border-line pt-3">
                  <DangerButton
                    label="Void question"
                    id="void"
                    confirming={confirming}
                    setConfirming={setConfirming}
                    reason={reason}
                    setReason={setReason}
                    onDo={(r) => void cmd({ type: "QUESTION_VOID", matchQuestionId: snapshot.activeQuestion.matchQuestionId!, reason: r })}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── right column: scores, overrides, health ─────── */}
        <div className="flex flex-col gap-4">
          {/* scores */}
          <div className="panel p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold tracking-widest text-muted uppercase">Scores</span>
              <button
                className="btn btn-ghost !px-3 !py-1.5 !text-xs"
                onClick={() => void cmd({ type: "LEADERBOARD_SET", visible: !snapshot.leaderboardVisible })}
              >
                {snapshot.leaderboardVisible ? "Hide leaderboard" : "Show leaderboard"}
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              {[...snapshot.schools]
                .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                .map((s, i) => (
                  <div key={s.schoolId} className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ${s.isPlaying ? "bg-accent/10" : ""}`}>
                    <span>
                      <span className="mr-2 text-muted">{i + 1}</span>
                      {s.abbreviation ?? s.name}
                      {s.isPlaying && <span className="ml-2 text-[10px] font-bold text-accent">PLAYING</span>}
                    </span>
                    <span className="font-mono font-bold">{s.score}</span>
                  </div>
                ))}
            </div>

            {/* score override */}
            <div className="mt-3 border-t border-line pt-3">
              <div className="label">Score override</div>
              <div className="flex flex-wrap gap-2">
                <select className="input min-w-0 flex-1" value={overrideSchool} onChange={(e) => setOverrideSchool(e.target.value)}>
                  <option value="">School…</option>
                  {snapshot.schools.map((s) => (
                    <option key={s.schoolId} value={s.schoolId}>{s.name}</option>
                  ))}
                </select>
                <input className="input !w-24 shrink-0" type="number" value={overridePoints} onChange={(e) => setOverridePoints(e.target.value)} />
              </div>
              <button
                className="btn btn-warn mt-2 w-full"
                disabled={!overrideSchool || !reason.trim() || Number(overridePoints) === 0}
                onClick={() =>
                  void cmd({
                    type: "SCORE_OVERRIDE",
                    schoolId: overrideSchool,
                    points: Number(overridePoints),
                    reason: reason.trim() || "gm_override",
                  })
                }
              >
                Apply override
              </button>
              <input
                className="input mt-2"
                placeholder="Reason (required, audited)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>

          {/* category control */}
          {snapshot.availableCategories.length > 1 && (
            <div className="panel p-4">
              <div className="mb-2 text-xs font-bold tracking-widest text-muted uppercase">
                Category Control
              </div>
              <div className="text-sm mb-2">
                <span className="font-semibold">Current:</span> {snapshot.currentCategory?.name ?? "—"}
              </div>
              <div className="flex flex-wrap gap-2">
                {snapshot.availableCategories.map((cat) => {
                  const isActive = snapshot.currentCategory?.id === cat.id;
                  return (
                    <span
                      key={cat.id}
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        isActive
                          ? "bg-accent text-black"
                          : "bg-panel-2 text-muted"
                      }`}
                    >
                      {cat.name}
                    </span>
                  );
                })}
              </div>
              <button
                className="btn btn-ghost !mt-3 !px-3 !py-1.5 !text-xs"
                disabled={!snapshot.currentCategory}
                onClick={() => {
                  const currentIdx = snapshot.availableCategories.findIndex(c => c.id === snapshot.currentCategory?.id);
                  if (currentIdx >= 0 && currentIdx < snapshot.availableCategories.length - 1) {
                    const nextCat = snapshot.availableCategories[currentIdx + 1];
                    send({
                      type: "CATEGORY_ADVANCE",
                      categoryId: nextCat.id,
                      reason: "gm_next_category",
                    });
                  }
                }}
              >
                Next Category →
              </button>
            </div>
          )}

          {/* qualification */}
          <div className="panel p-4">
            <div className="mb-2 text-xs font-bold tracking-widest text-muted uppercase">Qualification</div>
            {(snapshot.qualificationRules.qualifyCount !== null ||
              snapshot.qualificationRules.eliminateCount !== null) && (
              <div className="mb-2 text-xs text-muted">
                Top {snapshot.qualificationRules.qualifyCount ?? "—"} qualify · bottom{" "}
                {snapshot.qualificationRules.eliminateCount ?? "—"} eliminated — applied automatically at match
                end, overridable here.
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              {snapshot.schools.map((s) => (
                <div
                  key={s.schoolId}
                  className="flex items-center justify-between gap-2 rounded-md border border-line bg-panel-2 px-2 py-1.5 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{s.abbreviation ?? s.name}</span>
                    <span className={qualificationChip(s.qualification)}>{s.qualification || "—"}</span>
                  </span>
                  <select
                    className="input !w-auto !py-1.5 !text-xs"
                    value={s.qualification || "NONE"}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "NONE") return;
                      void cmd({
                        type: "QUALIFICATION_SET",
                        schoolId: s.schoolId,
                        status: v as "QUALIFIED" | "ELIMINATED" | "NOT_APPLICABLE" | "PENDING",
                        reason: "gm_manual",
                      });
                    }}
                  >
                    <option value="NONE">Set…</option>
                    <option value="QUALIFIED">Qualified</option>
                    <option value="ELIMINATED">Eliminated</option>
                    <option value="NOT_APPLICABLE">N/A</option>
                    <option value="PENDING">Pending</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* connections */}
          <div className="panel p-4">
            <div className="mb-2 text-xs font-bold tracking-widest text-muted uppercase">School devices</div>
            <div className="flex flex-col gap-1.5 text-sm">
              {snapshot.schools.map((s) => (
                <div key={s.schoolId} className="flex items-center justify-between">
                  <span>{s.name}</span>
                  <span className={s.isPlaying ? "text-good" : "text-muted"}>
                    {s.isPlaying ? "● playing" : "○ waiting"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* event history */}
          <div className="panel p-4">
            <div className="mb-2 text-xs font-bold tracking-widest text-muted uppercase">Event history</div>
            <div className="max-h-64 overflow-y-auto font-mono text-[11px] leading-relaxed text-muted">
              {events.length === 0 && <div>No events yet.</div>}
              {events.map((e) => (
                <div key={e.seq} className="flex gap-2">
                  <span className="text-foreground/40">#{e.seq}</span>
                  <span>{e.type}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────

function nextControl(s: MatchSnapshot): { label: string; command: Command; tone: string } | null {
  switch (s.phase) {
    case "SELECTION":
      return s.activeQuestion.matchQuestionId
        ? { label: "Reveal question", command: { type: "QUESTION_REVEAL" }, tone: "btn btn-primary" }
        : null; // wait for school (or GM board pick above)
    case "ANSWERING":
      return null; // wait for answer / timer
    case "JUDGING":
      return null; // judging buttons above
    case "AWAITING_REVEAL":
      return { label: "Reveal result", command: { type: "RESULT_REVEAL" }, tone: "btn btn-primary" };
    case "RESULT":
      return { label: "Next turn →", command: { type: "NEXT_TURN" }, tone: "btn btn-good" };
    default:
      return null;
  }
}

function phaseHint(phase: string, categoryName?: string | null): string {
  switch (phase) {
    case "LOBBY":
      return "Lobby — start the match when schools are ready.";
    case "SELECTION":
      return `Selection ${categoryName ? `(${categoryName})` : ""} — the active school picks a question.`;
    case "ANSWERING":
      return "Answering — the school is working on the question.";
    case "JUDGING":
      return "Judging — record the verdict for the submitted answer.";
    case "AWAITING_REVEAL":
      return "Answer in — reveal the result when you are ready.";
    case "RESULT":
      return "Result shown — advance to the next turn.";
    default:
      return "";
  }
}

function qualificationChip(status: string): string {
  switch (status) {
    case "QUALIFIED":
      return "rounded-full bg-good/20 px-2 py-0.5 text-[10px] font-black text-good uppercase";
    case "ELIMINATED":
      return "rounded-full bg-bad/20 px-2 py-0.5 text-[10px] font-black text-bad uppercase";
    case "PENDING":
      return "rounded-full bg-warn/20 px-2 py-0.5 text-[10px] font-black text-warn uppercase";
    default:
      return "rounded-full bg-line px-2 py-0.5 text-[10px] font-black text-muted uppercase";
  }
}

function TimerBtn({ label, onClick, show }: { label: string; onClick: () => void; show: boolean }) {  if (!show) return null;
  return (
    <button className="btn btn-ghost !text-xs" onClick={onClick}>
      {label}
    </button>
  );
}

function GmBoard({ snapshot, onPick }: { snapshot: MatchSnapshot; onPick: (id: string) => void }) {
  return <CategoryBoard cells={snapshot.board} onPick={onPick} />;
}

function DangerButton({
  label,
  id,
  confirming,
  setConfirming,
  reason,
  setReason,
  onDo,
}: {
  label: string;
  id: string;
  confirming: string | null;
  setConfirming: (v: string | null) => void;
  reason: string;
  setReason: (v: string) => void;
  onDo: (reason: string) => void;
}) {
  if (confirming === id) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-warn/50 bg-warn/10 p-2">
        <span className="text-xs font-bold text-warn">{label} — confirm:</span>
        <input
          className="input min-w-0 flex-1 !py-1.5 !text-xs sm:!w-44 sm:flex-none"
          placeholder="Reason (audited)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
        <button className="btn btn-bad !py-1.5 !text-xs" disabled={!reason.trim()} onClick={() => onDo(reason.trim())}>
          Confirm
        </button>
        <button className="btn btn-ghost !py-1.5 !text-xs" onClick={() => setConfirming(null)}>
          Cancel
        </button>
      </div>
    );
  }
  return (
    <button className="btn btn-ghost" onClick={() => setConfirming(id)}>
      {label}
    </button>
  );
}
