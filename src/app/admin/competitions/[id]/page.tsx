"use client";

// Competition detail: rounds, match setup (spec §4.4 wizard, simplified),
// question assignment, publish validation, and access codes.

import { use, useCallback, useEffect, useState } from "react";
import { apiGet, apiSend, ClientApiError } from "@/lib/client";
import MatchWizard from "@/components/admin/MatchWizard";
import { FORMAT_LABELS, FORMAT_PRESETS } from "@/lib/formats";

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
type MatchQuestionRow = {
  id: string;
  pointValue: number;
  state: string;
  question: { id: string; text: string; category: { name: string } };
};
type MatchRow = {
  id: string;
  matchNumber: number;
  status: string;
  selectionMethod: string;
  schools: { schoolId: string; turnOrder: number; school: { name: string; abbreviation: string | null } }[];
  _count: { questions: number };
};
type Round = { id: string; name: string; orderIndex: number; status: string; matches: MatchRow[] };
type Competition = {
  id: string;
  name: string;
  edition: string | null;
  status: string;
  rules: string | null;
  format: string | null;
  rounds: Round[];
};

export default function CompetitionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // wizard state
  const [roundName, setRoundName] = useState("");
  const [questionFilter, setQuestionFilter] = useState<string>("");
  const [pickedQuestions, setPickedQuestions] = useState<string[]>([]);
  const [assignOpen, setAssignOpen] = useState<string | null>(null); // matchId being edited
  const [matchQuestions, setMatchQuestions] = useState<Record<string, MatchQuestionRow[]>>({});
  const [busy, setBusy] = useState(false);

  // rules & format editor
  const [rulesDraft, setRulesDraft] = useState<string | null>(null);
  const [formatDraft, setFormatDraft] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await apiGet<{ competition: Competition }>(`/api/admin/competitions/${id}`);
    setCompetition(d.competition);
    setRulesDraft((prev) => prev ?? d.competition.rules ?? "");
    setFormatDraft((prev) => prev ?? d.competition.format ?? "");
  }, [id]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
    apiGet<{ schools: School[] }>("/api/admin/schools").then((d) => setSchools(d.schools)).catch(() => {});
    apiGet<{ categories: Category[] }>("/api/admin/categories").then((d) => setCategories(d.categories)).catch(() => {});
    apiGet<{ questions: Question[] }>("/api/admin/questions?take=500").then((d) => setQuestions(d.questions)).catch(() => {});
  }, [load]);

  async function guard(fn: () => Promise<unknown>, okMsg?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (okMsg) setNotice(okMsg);
      await load();
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function addRound(e: React.FormEvent) {
    e.preventDefault();
    await guard(async () => {
      await apiSend("/api/admin/rounds", "POST", { competitionId: id, name: roundName });
      setRoundName("");
    }, "Round created");
  }

  async function loadMatchQuestions(matchId: string) {
    const d = await apiGet<{ match: { questions: MatchQuestionRow[] } }>(`/api/admin/matches/${matchId}`);
    setMatchQuestions((prev) => ({ ...prev, [matchId]: d.match.questions }));
  }

  async function publish(matchId: string) {
    await guard(async () => {
      const d = await apiSend<{ published: boolean; problems: string[] }>(`/api/admin/matches/${matchId}/publish`, "POST");
      if (d.published) setNotice("Match published — it is ready to play.");
      else setError(`Cannot publish:\n• ${d.problems.join("\n• ")}`);
    });
  }

  if (!competition) {
    return <div className="text-muted">{error ? <span className="text-bad">{error}</span> : "Loading…"}</div>;
  }

  const filteredQuestions = questions.filter(
    (q) => q.active && (!questionFilter || q.category.id === questionFilter)
  );

  // ── setup progress & next step ──
  const allMatches = competition.rounds.flatMap((r) => r.matches);
  const totalMatches = allMatches.length;
  const withQuestions = allMatches.filter((m) => m._count.questions > 0).length;
  const publishedMatches = allMatches.filter((m) => m.status !== "DRAFT").length;
  const anyLive = allMatches.some((m) => m.status === "LIVE" || m.status === "COMPLETED");
  const emptyMatches = allMatches.filter(
    (m) => m._count.questions === 0 && m.status !== "LIVE" && m.status !== "COMPLETED"
  );
  const latestRound = competition.rounds[competition.rounds.length - 1];
  const readyToAdvance =
    (competition.format === "KNOCKOUT" || competition.format === "TOP_N_FINAL") &&
    !!latestRound &&
    latestRound.matches.length > 0 &&
    latestRound.matches.every((m) => m.status === "COMPLETED") &&
    latestRound.name !== "Final";
  const progress = [
    { label: "Format & rules chosen", done: !!competition.format || !!competition.rules },
    { label: "Rounds & matches created", done: totalMatches > 0 },
    { label: `Questions on every match (${withQuestions}/${totalMatches})`, done: totalMatches > 0 && withQuestions === totalMatches },
    { label: `Matches published (${publishedMatches}/${totalMatches})`, done: totalMatches > 0 && publishedMatches === totalMatches },
    { label: "Competition live", done: anyLive || competition.status === "LIVE" || competition.status === "COMPLETED" },
  ];

  async function advanceRound() {
    await guard(async () => {
      const d = await apiSend<{ round: { name: string }; matches: number; qualified: number; published: number }>(
        `/api/admin/competitions/${id}/advance`,
        "POST"
      );
      setNotice(
        `${d.round.name} created — ${d.matches} match(es) from ${d.qualified} qualified school(s)` +
          (d.published === d.matches ? ", published and ready to play." : `, ${d.published} published.`)
      );
    });
  }

  async function assignToEmptyMatches() {
    await guard(async () => {
      let matches = 0;
      let added = 0;
      for (const m of emptyMatches) {
        const r = await apiSend<{ added: number }>(`/api/admin/matches/${m.id}`, "POST", {
          questionIds: pickedQuestions,
        });
        added += r.added;
        matches += 1;
      }
      setPickedQuestions([]);
      setNotice(`Assigned ${added} question(s) across ${matches} match(es).`);
    });
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {competition.name}
            {competition.edition && <span className="ml-2 text-xl font-normal text-muted">{competition.edition}</span>}
          </h1>
          <div className="mt-1 text-sm text-muted">{competition.rounds.length} rounds</div>
        </div>
        <select
          className="input !w-40"
          value={competition.status}
          onChange={(e) =>
            void guard(() => apiSend(`/api/admin/competitions/${id}`, "PATCH", { status: e.target.value }), "Status updated")
          }
        >
          {["DRAFT", "READY", "LIVE", "PAUSED", "COMPLETED", "ARCHIVED"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {error && <div className="mb-4 whitespace-pre-wrap rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>}
      {notice && <div className="mb-4 rounded-md border border-good/40 bg-good/10 px-3 py-2 text-sm text-good">{notice}</div>}

      {/* setup progress & next step */}
      <div className="panel mb-6 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-bold tracking-widest text-muted uppercase">Setup progress</div>
          <span className="text-xs text-muted">
            {competition.format ? FORMAT_LABELS[competition.format] ?? competition.format : "no format chosen yet"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {progress.map((p) => (
            <span
              key={p.label}
              className={`chip ${p.done ? "chip-ready" : "chip-draft"}`}
              title={p.done ? "Done" : "Still to do"}
            >
              {p.done ? "✓" : "○"} {p.label}
            </span>
          ))}
        </div>
        {emptyMatches.length > 0 && pickedQuestions.length > 0 && (
          <p className="mt-3 text-xs text-muted">
            {pickedQuestions.length} picked below — use <b>Assign to empty matches</b> to fill {emptyMatches.length} match(es) in one go.
          </p>
        )}
        {readyToAdvance && (
          <div className="mt-3 flex items-center gap-3">
            <button className="btn btn-good !text-xs" disabled={busy} onClick={() => void advanceRound()}>
              Create {latestRound?.name === "Preliminaries" || competition.format === "TOP_N_FINAL" ? "Final" : "next round"} from qualified schools →
            </button>
            <span className="text-xs text-muted">Every match in {latestRound?.name} has completed.</span>
          </div>
        )}
      </div>

      {/* create round */}
      <form onSubmit={addRound} className="panel mb-6 flex items-end gap-3 p-4">
        <div className="flex-1">
          <label className="label" htmlFor="rname">New round</label>
          <input id="rname" className="input" placeholder="Preliminary, Semifinal…" value={roundName} onChange={(e) => setRoundName(e.target.value)} required />
        </div>
        <button className="btn btn-primary" disabled={busy || !roundName.trim()}>Add round</button>
      </form>

      {/* rounds + matches */}
      {competition.rounds.length === 0 && (
        <div className="panel px-4 py-6 text-sm text-muted">No rounds yet — add one above to start building matches.</div>
      )}

      {/* rules & competition format */}
      <div className="panel mb-6 p-4">
        <div className="mb-3 text-xs font-bold tracking-widest text-muted uppercase">
          Rules & competition format
        </div>
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          {(Object.entries(FORMAT_PRESETS) as [string, { label: string; blurb: string }][]).map(
            ([key, preset]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFormatDraft(key)}
                className={`rounded-xl border-2 p-3 text-left transition-colors ${
                  formatDraft === key
                    ? "border-accent bg-accent/10"
                    : "border-line bg-panel-2 hover:border-accent-2"
                }`}
              >
                <div className="flex items-center gap-2 text-sm font-bold">
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                      formatDraft === key ? "border-accent bg-accent" : "border-line"
                    }`}
                  />
                  {preset.label}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">{preset.blurb}</p>
              </button>
            )
          )}
        </div>
        <label className="label" htmlFor="rules">
          Rules & instructions (shown to schools before every game and on the venue screen)
        </label>
        <textarea
          id="rules"
          className="input min-h-32"
          placeholder={
            "Example:\n• Each school takes turns picking a question worth 10–50 points.\n• You have 30 seconds to answer.\n• Correct = +points · Wrong = turn passes to the next school.\n• After round 2, the bottom two schools are eliminated."
          }
          value={rulesDraft ?? ""}
          onChange={(e) => setRulesDraft(e.target.value)}
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() =>
              void guard(
                () =>
                  apiSend(`/api/admin/competitions/${id}`, "PATCH", {
                    rules: rulesDraft?.trim() ? rulesDraft : null,
                    format: formatDraft || null,
                  }),
                "Rules & format saved — schools and screens will see them."
              )
            }
          >
            Save rules & format
          </button>
          <span className="text-xs text-muted">
            Format: {formatDraft ? FORMAT_PRESETS[formatDraft]?.label ?? formatDraft : "not chosen yet"}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {competition.rounds.map((round) => (
          <div key={round.id} className="panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-bold">
                {round.name} <span className="ml-2 text-xs font-normal text-muted">order {round.orderIndex}</span>
              </div>
              <span className="chip chip-draft">{round.status}</span>
            </div>

            {round.matches.map((m) => (
              <div key={m.id} className="mb-3 rounded-lg border border-line bg-panel-2 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold">Match {m.matchNumber}</span>
                    <span className="ml-2 text-xs text-muted">
                      {m.schools.map((s) => s.school.abbreviation ?? s.school.name).join(" vs ")} · {m._count.questions}Q · {m.selectionMethod}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className={`chip ${m.status === "LIVE" ? "chip-live" : m.status === "READY" ? "chip-ready" : "chip-draft"}`}>{m.status}</span>
                    <button
                      className="btn btn-ghost !px-2 !py-1 !text-xs"
                      onClick={() => {
                        const open = assignOpen === m.id;
                        setAssignOpen(open ? null : m.id);
                        if (!open && !matchQuestions[m.id]) void loadMatchQuestions(m.id);
                      }}
                    >
                      Questions
                    </button>
                    {m.status === "DRAFT" && (
                      <button className="btn btn-good !px-2 !py-1 !text-xs" onClick={() => void publish(m.id)} disabled={busy}>
                        Publish
                      </button>
                    )}
                  </div>
                </div>

                {assignOpen === m.id && (
                  <div className="mt-3 border-t border-line pt-3">
                    <div className="mb-2 text-xs font-bold tracking-widest text-muted uppercase">Assigned questions</div>
                    <div className="mb-3 flex max-h-40 flex-col gap-1 overflow-y-auto">
                      {(matchQuestions[m.id] ?? []).map((mq) => (
                        <div key={mq.id} className="flex items-center justify-between text-xs">
                          <span className="truncate">
                            <span className="mr-2 text-muted">{mq.question.category.name}</span>
                            {mq.question.text}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="chip chip-draft">{mq.state}</span>
                            {mq.state === "AVAILABLE" && (
                              <button
                                className="text-bad hover:underline"
                                onClick={() =>
                                  void guard(async () => {
                                    await apiSend(`/api/admin/matches/${m.id}`, "DELETE", { matchQuestionIds: [mq.id] });
                                    await loadMatchQuestions(m.id);
                                  }, "Question removed")
                                }
                              >
                                remove
                              </button>
                            )}
                          </span>
                        </div>
                      ))}
                      {(matchQuestions[m.id] ?? []).length === 0 && (
                        <div className="text-xs text-muted">No questions assigned yet.</div>
                      )}
                    </div>
                    <button
                      className="btn btn-ghost !text-xs"
                      disabled={busy}
                      onClick={() =>
                        void guard(async () => {
                          await apiSend(`/api/admin/matches/${m.id}`, "POST", { questionIds: pickedQuestions });
                          setPickedQuestions([]);
                          await loadMatchQuestions(m.id);
                        }, "Questions assigned")
                      }
                    >
                      Assign {pickedQuestions.length} selected below
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* the guided setup wizard lives below the round list */}
          </div>
        ))}
      </div>

      {/* match setup wizard */}
      <div className="panel mt-6 p-4">
        <div className="mb-3 text-xs font-bold tracking-widest text-muted uppercase">Match setup</div>
        <MatchWizard
          rounds={competition.rounds.map((r) => ({ id: r.id, name: r.name, orderIndex: r.orderIndex }))}
          schools={schools}
          categories={categories}
          questions={questions}
          onDone={(msg) => setNotice(msg)}
        />
      </div>

      {/* question picker (feeds the wizard above) */}
      <div className="panel mt-6 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold tracking-widest text-muted uppercase">
              Question bank — pick {pickedQuestions.length} for the next match / assignment
            </div>
            <div className="flex items-center gap-2">
              <select className="input !w-52" value={questionFilter} onChange={(e) => setQuestionFilter(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c._count.questions})</option>
                ))}
              </select>
              <button
                className="btn btn-primary !text-xs"
                disabled={busy || pickedQuestions.length === 0 || emptyMatches.length === 0}
                onClick={() => void assignToEmptyMatches()}
              >
                Assign to {emptyMatches.length} empty match(es)
              </button>
            </div>
          </div>
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {filteredQuestions.map((q) => {
              const picked = pickedQuestions.includes(q.id);
              return (
                <button
                  key={q.id}
                  type="button"
                  className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-xs ${
                    picked ? "border-accent/60 bg-accent/10" : "border-line/60 hover:bg-panel-2"
                  }`}
                  onClick={() =>
                    setPickedQuestions(
                      picked ? pickedQuestions.filter((x) => x !== q.id) : [...pickedQuestions, q.id]
                    )
                  }
                >
                  <span className="truncate">
                    <span className="mr-2 font-bold text-muted">{q.category.name}</span>
                    {q.text}
                  </span>
                  <span className="ml-2 shrink-0 font-mono">{q.defaultPoints}</span>
                </button>
              );
            })}
            {filteredQuestions.length === 0 && (
              <div className="py-4 text-center text-sm text-muted">
                No questions in the bank yet — add them in the Question Bank.
              </div>
            )}
          </div>
      </div>
    </div>
  );
}
