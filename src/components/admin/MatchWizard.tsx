"use client";

// Match setup wizard — a guided, step-by-step flow replacing the old
// ad-hoc form: Basics → Schools (turn order) → Questions & points →
// Review, then create (+ questions) and publish in one click.

import { useMemo, useState } from "react";
import { apiGet, apiSend, ClientApiError } from "@/lib/client";

type School = { id: string; name: string; abbreviation: string | null; active: boolean };
type Category = { id: string; name: string; _count: { questions: number } };
type Question = {
  id: string;
  text: string;
  type: string;
  defaultPoints: number;
  active: boolean;
  category: { id: string; name: string };
};
type Round = { id: string; name: string; orderIndex: number };

const STEPS = ["Basics", "Schools", "Questions", "Review"] as const;

export default function MatchWizard({
  rounds,
  schools,
  categories,
  questions,
  onDone,
}: {
  rounds: Round[];
  schools: School[];
  categories: Category[];
  questions: Question[];
  onDone: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [roundId, setRoundId] = useState("");
  const [selectionMethod, setSelectionMethod] = useState("BOARD");
  const [totalTurns, setTotalTurns] = useState("");
  const [answerSec, setAnswerSec] = useState("30");
  const [schoolIds, setSchoolIds] = useState<string[]>([]);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [points, setPoints] = useState("10");
  const [filter, setFilter] = useState("");

  const filtered = useMemo(
    () => questions.filter((q) => q.active && (!filter || q.category.id === filter)),
    [questions, filter]
  );

  const canNext =
    (step === 0 && roundId !== "") ||
    (step === 1 && schoolIds.length >= 2) ||
    step === 2 ||
    step === 3;

  function reset() {
    setStep(0);
    setSchoolIds([]);
    setPickedIds([]);
    setError(null);
  }

  async function finish(publish: boolean) {
    setBusy(true);
    setError(null);
    try {
      const config: Record<string, unknown> = {};
      if (totalTurns) config.turns = { total: Number(totalTurns) };
      if (Number(answerSec) > 0) config.timers = { answerSec: Number(answerSec) };
      const d = await apiSend<{ match: { id: string; matchNumber: number } }>("/api/admin/matches", "POST", {
        roundId,
        schoolIds,
        selectionMethod,
        config: Object.keys(config).length ? config : undefined,
      });
      if (pickedIds.length > 0) {
        await apiSend(`/api/admin/matches/${d.match.id}`, "POST", {
          questionIds: pickedIds,
          pointValue: Number(points) > 0 ? Number(points) : undefined,
        });
      }
      let msg = `Match ${d.match.matchNumber} created with ${pickedIds.length} question(s) @ ${points} pts each.`;
      if (publish) {
        const p = await apiSend<{ published: boolean; problems: string[] }>(
          `/api/admin/matches/${d.match.id}/publish`,
          "POST"
        );
        msg += p.published ? " Published ✓" : ` Publish blocked: ${p.problems.join("; ")}`;
      }
      onDone(msg);
      setOpen(false);
      reset();
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Could not create the match");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-primary" onClick={() => { setOpen(true); setRoundId(rounds[0]?.id ?? ""); }}>
        ＋ New match (wizard)
      </button>
    );
  }

  const round = rounds.find((r) => r.id === roundId);
  const pickedQuestions = questions.filter((q) => pickedIds.includes(q.id));

  return (
    <div className="panel p-4">
      {/* step indicator */}
      <div className="mb-5 flex items-center gap-1">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center gap-1">
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black transition-colors ${
                i < step
                  ? "bg-good text-black"
                  : i === step
                    ? "bg-accent text-black"
                    : "border border-line bg-panel-2 text-muted"
              } ${i < step ? "cursor-pointer" : ""}`}
            >
              {i < step ? "✓" : i + 1}
            </button>
            <span className={`hidden text-xs font-bold sm:block ${i === step ? "text-foreground" : "text-muted"}`}>
              {label}
            </span>
            {i < STEPS.length - 1 && <span className={`h-0.5 flex-1 ${i < step ? "bg-good" : "bg-line"}`} />}
          </div>
        ))}
      </div>

      {error && <div className="mb-3 rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>}

      {/* ── step 1: basics ── */}
      {step === 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="label">Round</div>
            {rounds.length === 0 ? (
              <p className="text-sm text-bad">Create a round first (form above).</p>
            ) : (
              <select className="input" value={roundId} onChange={(e) => setRoundId(e.target.value)}>
                {rounds.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <div className="label">How schools pick questions</div>
            <select className="input" value={selectionMethod} onChange={(e) => setSelectionMethod(e.target.value)}>
              <option value="BOARD">Board — school picks from the board (recommended)</option>
              <option value="CATEGORY_VALUE">Category + value</option>
              <option value="CATEGORY_RANDOM">Random within category</option>
              <option value="GM_ASSIGNED">Game Master assigns</option>
            </select>
          </div>
          <div>
            <div className="label">Answer time (seconds)</div>
            <input className="input" type="number" min={5} max={600} value={answerSec} onChange={(e) => setAnswerSec(e.target.value)} />
          </div>
          <div>
            <div className="label">Total turns (blank = until questions run out)</div>
            <input className="input" type="number" min={1} value={totalTurns} onChange={(e) => setTotalTurns(e.target.value)} />
          </div>
        </div>
      )}

      {/* ── step 2: schools ── */}
      {step === 1 && (
        <div>
          <div className="label">Schools — click order sets the turn order</div>
          <div className="flex flex-wrap gap-2">
            {schools.filter((s) => s.active).map((s) => {
              const idx = schoolIds.indexOf(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`btn !py-1.5 ${idx >= 0 ? "btn-primary" : "btn-ghost"}`}
                  onClick={() =>
                    setSchoolIds(
                      idx >= 0 ? schoolIds.filter((x) => x !== s.id) : [...schoolIds, s.id]
                    )
                  }
                >
                  {idx >= 0 && <span className="mr-1 rounded-full bg-black/20 px-1.5 text-xs">{idx + 1}</span>}
                  {s.abbreviation ?? s.name}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">
            {schoolIds.length} selected — pick at least 2. Turn order:{" "}
            {schoolIds
              .map((id) => schools.find((s) => s.id === id)?.abbreviation ?? "?")
              .join(" → ")}
          </p>
        </div>
      )}

      {/* ── step 3: questions + points ── */}
      {step === 2 && (
        <div>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div className="w-40">
              <div className="label">Points per question</div>
              <input className="input" type="number" min={1} max={1000} value={points} onChange={(e) => setPoints(e.target.value)} />
            </div>
            <div className="w-52">
              <div className="label">Category</div>
              <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c._count.questions})</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn btn-ghost !text-xs"
              onClick={() => setPickedIds(filtered.map((q) => q.id))}
            >
              Select all shown
            </button>
            <button
              type="button"
              className="btn btn-ghost !text-xs"
              onClick={() => setPickedIds([])}
            >
              Clear
            </button>
          </div>
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-1">
            {filtered.map((q) => {
              const picked = pickedIds.includes(q.id);
              return (
                <button
                  key={q.id}
                  type="button"
                  className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-xs ${
                    picked ? "border-accent/60 bg-accent/10" : "border-line/60 hover:bg-panel-2"
                  }`}
                  onClick={() =>
                    setPickedIds(picked ? pickedIds.filter((x) => x !== q.id) : [...pickedIds, q.id])
                  }
                >
                  <span className="truncate">
                    <span className="mr-2 font-bold text-muted">{q.category.name}</span>
                    {q.text}
                  </span>
                  <span className="ml-2 shrink-0 font-mono text-muted">{picked ? `✓ ${points} pts` : `${q.defaultPoints} pts`}</span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="py-4 text-center text-sm text-muted">No questions match this filter.</div>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">{pickedIds.length} selected · every question is worth {points} pts in this match</p>
        </div>
      )}

      {/* ── step 4: review ── */}
      {step === 3 && (
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg border border-line bg-panel-2 p-3">
            <div className="label">Setup</div>
            <div>Round: <b>{round?.name ?? "—"}</b></div>
            <div>Picking: <b>{selectionMethod.replace("_", " ").toLowerCase()}</b></div>
            <div>Answer time: <b>{answerSec}s</b></div>
            <div>Turns: <b>{totalTurns || "until questions run out"}</b></div>
          </div>
          <div className="rounded-lg border border-line bg-panel-2 p-3">
            <div className="label">Turn order</div>
            <div>
              {schoolIds
                .map((sid) => schools.find((s) => s.id === sid)?.abbreviation ?? "?")
                .join(" → ")}
            </div>
          </div>
          <div className="rounded-lg border border-line bg-panel-2 p-3 sm:col-span-2">
            <div className="label">Questions — {pickedIds.length} picked @ {points} pts</div>
            <div className="max-h-32 overflow-y-auto text-xs">
              {pickedQuestions.map((q) => (
                <div key={q.id} className="truncate py-0.5">
                  <span className="mr-2 text-muted">{q.category.name}</span>
                  {q.text}
                </div>
              ))}
              {pickedIds.length === 0 && <span className="text-muted">None — you can assign questions later.</span>}
            </div>
          </div>
        </div>
      )}

      {/* nav */}
      <div className="mt-5 flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => { setOpen(false); reset(); }}>
            Cancel
          </button>
          {step > 0 && (
            <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>
              ← Back
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {step < 3 && (
            <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
              Next →
            </button>
          )}
          {step === 3 && (
            <>
              <button className="btn btn-ghost" disabled={busy} onClick={() => void finish(false)}>
                Create draft
              </button>
              <button className="btn btn-good" disabled={busy} onClick={() => void finish(true)}>
                Create & publish ✓
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
