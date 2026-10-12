"use client";

// School / contestant screen (spec §3.4). Mobile-first, single page per turn:
// identity → turn status → selection board → question → submission receipt.
// The correct answer never reaches this client before an authorized reveal.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMatchRealtime } from "@/lib/realtime";
import { Countdown } from "@/components/Countdown";

export default function PlayPage() {
  const router = useRouter();
  const [matchId, setMatchId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("fassa_match");
    if (!stored) {
      router.replace("/join");
      return;
    }
    setMatchId(stored);
  }, [router]);

  const { snapshot, connected, error, send } = useMatchRealtime(matchId);

  // a new active question means a new turn — clear the previous receipt
  const activeMqId = snapshot?.activeQuestion.matchQuestionId ?? null;
  useEffect(() => {
    setReceipt(null);
    setAnswer("");
  }, [activeMqId]);

  const viewerSchoolId = snapshot?.viewerSchoolId ?? null;
  const activeSchoolId = snapshot?.turn.activeSchoolId ?? null;
  const isMyTurn = !!viewerSchoolId && viewerSchoolId === activeSchoolId;
  const phase = snapshot?.phase ?? "LOBBY";
  const status = snapshot?.status ?? "DRAFT";

  const mySchool = useMemo(
    () => snapshot?.schools.find((s) => s.schoolId === viewerSchoolId) ?? null,
    [snapshot, viewerSchoolId]
  );

  const board = useMemo(() => {
    if (!snapshot) return [];
    const byCategory = new Map<string, typeof snapshot.board>();
    for (const cell of snapshot.board) {
      const list = byCategory.get(cell.categoryName) ?? [];
      list.push(cell);
      byCategory.set(cell.categoryName, list);
    }
    return [...byCategory.entries()].map(([name, cells]) => ({
      name,
      cells: cells.sort((a, b) => a.pointValue - b.pointValue),
    }));
  }, [snapshot]);

  const canSelect =
    isMyTurn && phase === "SELECTION" && status === "LIVE" && snapshot?.selectionMethod !== "GM_ASSIGNED";
  const canAnswer = isMyTurn && phase === "ANSWERING" && !!snapshot?.activeQuestion.revealed;
  const alreadySubmitted = !!receipt;

  async function pick(matchQuestionId: string) {
    setSelecting(true);
    try {
      await send({ type: "QUESTION_SELECT", matchQuestionId });
    } finally {
      setSelecting(false);
    }
  }

  async function submit() {
    if (!answer.trim()) return;
    const snap = await send({ type: "ANSWER_SUBMIT", text: answer.trim() });
    if (snap) {
      setReceipt(answer.trim());
      setAnswer("");
    }
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
        <div className="panel mt-4 px-8 py-5">
          <div className="text-xs tracking-widest text-muted uppercase">Your score</div>
          <div className="mt-1 text-4xl font-black">{mySchool?.score ?? 0}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-5">
      {/* header: identity + connection */}
      <div className="panel flex items-center justify-between px-4 py-3">
        <div>
          <div className="text-[11px] font-bold tracking-widest text-muted uppercase">
            {snapshot.competition.name} · {snapshot.round.name}
          </div>
          <div className="text-lg font-bold">{mySchool?.name ?? "…"}</div>
        </div>
        <div className="flex items-center gap-2 text-xs">
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
          <Countdown timer={snapshot.timer} />
          {snapshot.timer.status === "PAUSED" && (
            <span className="ml-3 chip chip-paused">PAUSED</span>
          )}
        </div>
      )}

      {/* selection board */}
      {phase === "SELECTION" && (
        <div className="flex flex-col gap-3">
          {board.map((cat) => (
            <div key={cat.name} className="panel p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-accent-2" />
                <span className="text-sm font-bold">{cat.name}</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {cat.cells.map((cell) => {
                  const taken = cell.state !== "AVAILABLE";
                  return (
                    <button
                      key={cell.matchQuestionId}
                      disabled={taken || !canSelect || selecting}
                      onClick={() => void pick(cell.matchQuestionId)}
                      className={`rounded-lg border px-2 py-3 text-center transition-colors ${
                        taken
                          ? "border-line/60 bg-panel-2 text-muted/40 line-through"
                          : canSelect
                            ? "border-accent/50 bg-accent/10 font-bold text-accent hover:bg-accent/20"
                            : "border-line bg-panel-2 text-muted"
                      }`}
                    >
                      <div className="text-lg font-black">{cell.pointValue}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {!canSelect && snapshot.selectionMethod === "GM_ASSIGNED" && (
            <div className="text-center text-sm text-muted">Questions are assigned by the Game Master.</div>
          )}
        </div>
      )}

      {/* active question */}
      {snapshot.activeQuestion.revealed && snapshot.activeQuestion.text && (
        <div className="panel p-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-bold tracking-widest text-muted uppercase">
              {snapshot.activeQuestion.categoryName}
            </span>
            <span className="chip chip-ready">
              {snapshot.activeQuestion.pointValue} pts
              {snapshot.activeQuestion.isBonus && snapshot.activeQuestion.bonusPoints
                ? ` + ${snapshot.activeQuestion.bonusPoints} bonus`
                : ""}
            </span>
          </div>
          <div className="text-lg font-semibold">{snapshot.activeQuestion.text}</div>

          {canAnswer && !alreadySubmitted && (
            <div className="mt-4">
              {snapshot.activeQuestion.type === "MULTIPLE_CHOICE" &&
                snapshot.activeQuestion.options && (
                  <div className="grid gap-2">
                    {snapshot.activeQuestion.options.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={async () => {
                          const snap = await send({ type: "ANSWER_SUBMIT", text: opt.id });
                          if (snap) setReceipt(opt.text);
                        }}
                        className="btn btn-ghost justify-start text-left"
                      >
                        {opt.text}
                      </button>
                    ))}
                  </div>
                )}
              {snapshot.activeQuestion.type === "TRUE_FALSE" && (
                <div className="grid grid-cols-2 gap-2">
                  {["True", "False"].map((v) => (
                    <button
                      key={v}
                      onClick={async () => {
                        const snap = await send({ type: "ANSWER_SUBMIT", text: v });
                        if (snap) setReceipt(v);
                      }}
                      className="btn btn-ghost"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              )}
              {(snapshot.activeQuestion.type === "SHORT_TEXT" ||
                snapshot.activeQuestion.type === "NUMERICAL" ||
                snapshot.activeQuestion.type === "SUBJECTIVE") && (
                <div className="mt-3 flex gap-2">
                  <input
                    className="input"
                    placeholder={
                      snapshot.activeQuestion.type === "NUMERICAL" ? "Numeric answer" : "Your answer"
                    }
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void submit()}
                    maxLength={2000}
                  />
                  <button className="btn btn-primary" onClick={() => void submit()} disabled={!answer.trim()}>
                    Submit
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

      {/* result (only after authorized reveal) */}
      {phase === "RESULT" && snapshot.lastResult && (
        <div
          className={`panel p-5 text-center ${
            snapshot.lastResult.verdict === "CORRECT" ? "border-good/60" : "border-bad/40"
          }`}
        >
          <div
            className={`text-2xl font-black ${
              snapshot.lastResult.verdict === "CORRECT" ? "text-good" : "text-bad"
            }`}
          >
            {snapshot.lastResult.verdict === "CORRECT" ? "CORRECT" : "INCORRECT"}
          </div>
          {snapshot.lastResult.pointsAwarded !== 0 && (
            <div className="mt-1 text-lg font-bold">
              {snapshot.lastResult.pointsAwarded > 0 ? "+" : ""}
              {snapshot.lastResult.pointsAwarded} points
            </div>
          )}
          {snapshot.lastResult.answerText && (
            <div className="mt-2 text-sm text-muted">Your answer: {snapshot.lastResult.answerText}</div>
          )}
          {snapshot.lastResult.correctAnswer && (
            <div className="mt-1 text-sm">
              Correct answer: <span className="font-bold">{snapshot.lastResult.correctAnswer}</span>
            </div>
          )}
          {snapshot.lastResult.explanation && (
            <div className="mt-2 text-sm text-muted">{snapshot.lastResult.explanation}</div>
          )}
          <button
            className="btn btn-ghost mt-4"
            onClick={() => {
              setReceipt(null);
            }}
          >
            Continue
          </button>
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
