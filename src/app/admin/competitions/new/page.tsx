"use client";

// Competition setup wizard — League of Rounds. One competition is one league
// match on a single page: every chosen category gets its own board, schools
// collect points across categories, and the Game Master advances categories.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiSend, ClientApiError } from "@/lib/client";
import { FORMAT_PRESETS, buildRulesText } from "@/lib/formats";

const FORMAT = "LEAGUE_ROUNDS" as const;

type School = { id: string; name: string; abbreviation: string | null; active: boolean };
type Category = { id: string; name: string; _count: { questions: number } };
type Question = { id: string; active: boolean; category: { id: string } };

const STEPS = ["Basics", "Game rules", "Schools", "Categories", "Review"] as const;

export default function NewCompetitionWizard() {
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [edition, setEdition] = useState("");
  const [venue, setVenue] = useState("");
  const [organizer, setOrganizer] = useState("");

  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [catPlan, setCatPlan] = useState<Record<string, { boardTotal: string; perSchool: string }>>({});
  const [schoolIds, setSchoolIds] = useState<string[]>([]);

  const [answerSec, setAnswerSec] = useState("30");
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [autoAdvanceSec, setAutoAdvanceSec] = useState("5");
  const [sound, setSound] = useState(true);
  const [rulesText, setRulesText] = useState("");
  const [rulesEdited, setRulesEdited] = useState(false);
  const [publish, setPublish] = useState(true);

  const [schools, setSchools] = useState<School[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);

  useEffect(() => {
    apiGet<{ schools: School[] }>("/api/admin/schools").then((d) => setSchools(d.schools)).catch(() => {});
    apiGet<{ categories: Category[] }>("/api/admin/categories").then((d) => setCategories(d.categories)).catch(() => {});
    apiGet<{ questions: Question[] }>("/api/admin/questions?take=500").then((d) => setQuestions(d.questions)).catch(() => {});
    apiGet<{
      settings: { autoAdvance: boolean; autoAdvanceSec: number; sound: boolean };
    }>("/api/admin/settings")
      .then((d) => {
        setAutoAdvance(d.settings.autoAdvance);
        setAutoAdvanceSec(String(d.settings.autoAdvanceSec));
        setSound(d.settings.sound);
      })
      .catch(() => {});
  }, []);

  const schoolCount = schoolIds.length;
  const maxSchools = Math.max(schoolCount, 2);

  const chosenCategories = useMemo(
    () =>
      categoryIds
        .map((id) => categories.find((c) => c.id === id))
        .filter((c): c is Category => c !== undefined),
    [categoryIds, categories]
  );

  const bankCount = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const q of questions) {
      if (!q.active) continue;
      const id = q.category?.id;
      if (id) byCategory.set(id, (byCategory.get(id) ?? 0) + 1);
    }
    return byCategory;
  }, [questions]);

  const planRows = useMemo(
    () =>
      chosenCategories.map((c) => {
        const row = catPlan[c.id];
        return {
          categoryId: c.id,
          name: c.name,
          boardTotal: Number(row?.boardTotal) || 0,
          perSchool: Number(row?.perSchool) || 0,
        };
      }),
    [chosenCategories, catPlan]
  );

  const planRowError = (r: (typeof planRows)[number]): string | null => {
    if (r.perSchool < 1) return "Set the questions per school (at least 1).";
    if (r.boardTotal < 1) return "Set the board total (at least 1).";
    const needed = r.perSchool * maxSchools;
    if (r.boardTotal < needed) {
      return `${maxSchools} school(s) × ${r.perSchool} = ${needed} needed, but the board holds ${r.boardTotal}.`;
    }
    const bank = bankCount.get(r.categoryId) ?? 0;
    if (r.boardTotal > bank) {
      return `Only ${bank} active question(s) in the bank — the board asks for ${r.boardTotal}.`;
    }
    return null;
  };

  const planErrors = planRows.map(planRowError);
  const planValid = planRows.length > 0 && planErrors.every((e) => e === null);
  const perSchoolTurns = planRows.reduce((n, r) => n + r.perSchool, 0);
  const totalBoard = planRows.reduce((n, r) => n + r.boardTotal, 0);

  const generatedRules = useMemo(
    () =>
      buildRulesText(FORMAT, {
        schoolCount: maxSchools,
        perSchoolTurns,
        qualifyCount: null,
        eliminateCount: null,
        answerSec: Number(answerSec) || undefined,
        categories: planRows.map((r) => ({
          name: r.name,
          perSchool: r.perSchool,
          boardTotal: r.boardTotal,
        })),
      }),
    [maxSchools, perSchoolTurns, answerSec, planRows]
  );
  const rulesValue = rulesEdited ? rulesText : generatedRules;

  const canNext =
    (step === 0 && name.trim() !== "") ||
    step === 1 ||
    (step === 2 && schoolCount >= 2) ||
    (step === 3 && categoryIds.length > 0 && planValid) ||
    step === 4;

  function toggleCategory(categoryId: string) {
    if (categoryIds.includes(categoryId)) {
      setCategoryIds(categoryIds.filter((id) => id !== categoryId));
      setCatPlan((prev) => {
        const next = { ...prev };
        delete next[categoryId];
        return next;
      });
      return;
    }
    setCategoryIds([...categoryIds, categoryId]);
    setCatPlan((prev) =>
      prev[categoryId]
        ? prev
        : {
            ...prev,
            [categoryId]: {
              perSchool: "2",
              boardTotal: String(2 * Math.max(schoolCount, 2)),
            },
          }
    );
  }

  function setPlanRow(categoryId: string, patch: Partial<{ boardTotal: string; perSchool: string }>) {
    setCatPlan((prev) => ({
      ...prev,
      [categoryId]: {
        ...(prev[categoryId] ?? { boardTotal: "", perSchool: "" }),
        ...patch,
      },
    }));
  }

  async function create() {
    if (schoolCount < 2 || !planValid) return;
    setBusy(true);
    setError(null);
    try {
      const config: Record<string, unknown> = {};
      if (Number(answerSec) > 0) config.timers = { answerSec: Number(answerSec) };
      config.qualification = { qualifyCount: null, eliminateCount: null };
      config.flow = {
        autoAdvance,
        autoAdvanceSec: Math.min(60, Math.max(1, Number(autoAdvanceSec) || 5)),
        sound,
      };
      const d = await apiSend<{ competitionId: string }>("/api/admin/competitions/setup", "POST", {
        name: name.trim(),
        edition: edition.trim() || null,
        venue: venue.trim() || null,
        organizer: organizer.trim() || null,
        format: FORMAT,
        categoryIds,
        rules: rulesValue.trim() || null,
        schoolIds,
        selectionMethod: "BOARD",
        config,
        questionPlan: planRows.map((r) => ({
          categoryId: r.categoryId,
          boardTotal: r.boardTotal,
          perSchool: r.perSchool,
        })),
        publish,
      });
      router.push(`/admin/competitions/${d.competitionId}`);
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Could not create the competition");
      setBusy(false);
    }
  }

  const schoolLabel = (id: string) =>
    schools.find((s) => s.id === id)?.abbreviation ?? schools.find((s) => s.id === id)?.name ?? "?";

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-3xl font-bold">New competition</h1>
      <p className="mb-6 text-muted">
        League of rounds — one match, one page. Pick the categories and the size of each board; the
        Game Master moves the room to the next category when its turns are complete.
      </p>

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
            <span className={`hidden text-xs font-bold lg:block ${i === step ? "text-foreground" : "text-muted"}`}>
              {label}
            </span>
            {i < STEPS.length - 1 && <span className={`h-0.5 flex-1 ${i < step ? "bg-good" : "bg-line"}`} />}
          </div>
        ))}
      </div>

      {error && <div className="mb-4 rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>}

      <div className="panel p-4">
        {/* ── 1 basics ── */}
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="cname">Competition name</label>
              <input id="cname" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Inter-Varsity Championship" />
            </div>
            <div>
              <label className="label" htmlFor="cedition">Edition</label>
              <input id="cedition" className="input" value={edition} onChange={(e) => setEdition(e.target.value)} placeholder="2026" />
            </div>
            <div>
              <label className="label" htmlFor="cvenue">Venue</label>
              <input id="cvenue" className="input" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Main Auditorium" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="corg">Organizer (optional)</label>
              <input id="corg" className="input" value={organizer} onChange={(e) => setOrganizer(e.target.value)} />
            </div>
          </div>
        )}

        {/* ── 2 game rules ── */}
        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="asec">Answer time (seconds)</label>
              <input id="asec" className="input" type="number" min={5} max={600} value={answerSec} onChange={(e) => setAnswerSec(e.target.value)} />
            </div>
            <div>
              <div className="label">Questions per school</div>
              <div className="input flex items-center justify-between !bg-panel-2">
                <span className="font-bold">{perSchoolTurns > 0 ? perSchoolTurns : "—"}</span>
                <span className="text-xs text-muted">sum of the category plan</span>
              </div>
            </div>
            <div className="sm:col-span-2">
              <div className="label">After each result</div>
              <div className="flex flex-wrap items-center gap-4 rounded-md border border-line bg-panel-2 px-3 py-2 text-sm">
                <label className="flex items-center gap-2 font-semibold">
                  <input type="checkbox" checked={autoAdvance} onChange={(e) => setAutoAdvance(e.target.checked)} />
                  Auto-advance to the next turn
                </label>
                <label className="flex items-center gap-2">
                  after
                  <input className="input !w-20 !py-1" type="number" min={1} max={60} value={autoAdvanceSec} disabled={!autoAdvance} onChange={(e) => setAutoAdvanceSec(e.target.value)} />
                  seconds
                </label>
                <label className="flex items-center gap-2 font-semibold">
                  <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
                  Sound effects
                </label>
              </div>
            </div>
            <div className="sm:col-span-2">
              <div className="mb-1 flex items-center justify-between">
                <label className="label !mb-0" htmlFor="rules">Rules sheet (generated — edit freely)</label>
                {rulesEdited && (
                  <button type="button" className="text-xs text-accent-2 hover:underline" onClick={() => setRulesEdited(false)}>
                    ↻ Regenerate
                  </button>
                )}
              </div>
              <textarea
                id="rules"
                className="input min-h-36"
                value={rulesValue}
                onChange={(e) => { setRulesEdited(true); setRulesText(e.target.value); }}
              />
              <p className="mt-1 text-xs text-muted">Shown to schools before the game and on the venue screen.</p>
            </div>
          </div>
        )}

        {/* ── 3 schools ── */}
        {step === 2 && (
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
                    onClick={() => setSchoolIds(idx >= 0 ? schoolIds.filter((x) => x !== s.id) : [...schoolIds, s.id])}
                  >
                    {idx >= 0 && <span className="mr-1 rounded-full bg-black/20 px-1.5 text-xs">{idx + 1}</span>}
                    {s.abbreviation ?? s.name}
                  </button>
                );
              })}
              {schools.filter((s) => s.active).length === 0 && (
                <span className="text-sm text-muted">
                  No schools yet — add them in <b>Schools</b> first.
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-muted">{schoolCount} selected — at least 2.</p>
            {schoolCount >= 2 && (
              <div className="mt-4 rounded-lg border border-line bg-panel-2 p-3 text-sm">
                <div className="mb-2 text-xs font-bold tracking-widest text-muted uppercase">
                  League match — one page
                </div>
                <div>
                  <b>All {schoolCount} schools</b> play together in one match. Each category has its
                  own board; the Game Master moves to the next category when its turns are complete.
                </div>
                <div className="mt-1 text-muted">
                  Turn order: {schoolIds.map(schoolLabel).join(" → ")}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 4 categories ── */}
        {step === 3 && (
          <div>
            <div className="label">
              Categories — click to select; click order sets the category order
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const idx = categoryIds.indexOf(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`btn !py-1.5 ${idx >= 0 ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => toggleCategory(c.id)}
                  >
                    {idx >= 0 && <span className="mr-1 rounded-full bg-black/20 px-1.5 text-xs">{idx + 1}</span>}
                    {c.name}
                    <span className="ml-1.5 text-xs opacity-70">({c._count.questions} Q)</span>
                  </button>
                );
              })}
              {categories.length === 0 && (
                <span className="text-sm text-muted">
                  No categories yet — add them in the <b>Question Bank</b> first.
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-muted">
              {categoryIds.length} categor{categoryIds.length === 1 ? "y" : "ies"} selected — at
              least 1. The Game Master advances through them in this order.
            </p>

            {planRows.length > 0 && (
              <>
                <div className="mt-4 overflow-x-auto rounded-lg border border-line">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line bg-panel-2 text-left text-xs text-muted">
                        <th className="px-3 py-2 font-bold">Category</th>
                        <th className="px-3 py-2 font-bold">Active in bank</th>
                        <th className="px-3 py-2 font-bold">Board total</th>
                        <th className="px-3 py-2 font-bold">Per school</th>
                        <th className="px-3 py-2 font-bold">Needed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {planRows.map((r, i) => {
                        const bank = bankCount.get(r.categoryId) ?? 0;
                        const needed = r.perSchool * maxSchools;
                        const rowError = planErrors[i];
                        return (
                          <tr key={r.categoryId} className={`border-b border-line/50 last:border-0 ${rowError ? "bg-bad/5" : ""}`}>
                            <td className="px-3 py-2 font-semibold">
                              <span className="mr-2 text-xs text-muted">{i + 1}</span>
                              {r.name}
                            </td>
                            <td className={`px-3 py-2 font-mono text-xs ${bank === 0 ? "text-bad" : "text-muted"}`}>{bank}</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={1}
                                max={500}
                                className="input !w-24 !py-1 !text-xs"
                                value={catPlan[r.categoryId]?.boardTotal ?? ""}
                                onChange={(e) => setPlanRow(r.categoryId, { boardTotal: e.target.value })}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={1}
                                max={100}
                                className="input !w-20 !py-1 !text-xs"
                                value={catPlan[r.categoryId]?.perSchool ?? ""}
                                onChange={(e) => setPlanRow(r.categoryId, { perSchool: e.target.value })}
                              />
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-muted">
                              {needed}
                              {rowError && <div className="mt-0.5 max-w-56 font-sans text-bad">{rowError}</div>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
                  <span>
                    Board total: <b className="text-foreground">{totalBoard}</b> question{totalBoard === 1 ? "" : "s"} across{" "}
                    {planRows.length} categor{planRows.length === 1 ? "y" : "ies"}.
                  </span>
                  <span>
                    Each school answers <b className="text-foreground">{perSchoolTurns}</b> question{perSchoolTurns === 1 ? "" : "s"}.
                  </span>
                </div>
                {!planValid && (
                  <p className="mt-2 text-xs text-bad">
                    Fix the highlighted rows to continue — or top up the Question Bank.
                  </p>
                )}
              </>
            )}
            {planRows.length === 0 && (
              <p className="mt-3 text-xs text-warn">Pick at least one category to continue.</p>
            )}
          </div>
        )}

        {/* ── 5 review ── */}
        {step === 4 && (
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-panel-2 p-3">
              <div className="label">Competition</div>
              <div className="font-bold">{name || "—"}{edition && ` · ${edition}`}</div>
              <div className="text-muted">{venue || "no venue"} · {organizer || "no organizer"}</div>
              <div className="mt-1">Format: <b>{FORMAT_PRESETS[FORMAT].label}</b></div>
            </div>
            <div className="rounded-lg border border-line bg-panel-2 p-3">
              <div className="label">Game rules</div>
              <div>Questions per school: <b>{perSchoolTurns}</b> · Board total: <b>{totalBoard}</b></div>
              <div>Answer time: <b>{answerSec}s</b> · Auto-advance: <b>{autoAdvance ? `${autoAdvanceSec}s` : "off"}</b></div>
              <div>Sound: <b>{sound ? "on" : "off"}</b> · Schools: <b>{schoolCount}</b></div>
            </div>
            <div className="rounded-lg border border-line bg-panel-2 p-3 sm:col-span-2">
              <div className="label">Categories — the Game Master advances in this order</div>
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {planRows.map((r) => (
                  <span key={r.categoryId}>
                    <b>{r.name}</b>{" "}
                    <span className="text-muted">
                      {r.perSchool}/school · {r.boardTotal} on the board
                    </span>
                  </span>
                ))}
                {planRows.length === 0 && <span className="text-muted">—</span>}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-panel-2 p-3 sm:col-span-2">
              <div className="label">One page, one match</div>
              <div>
                <b>{schoolCount} school(s)</b> in one league match on one page. The active category
                board is shown to players and the audience; the Game Master advances categories
                after each category&apos;s turns. Scores accumulate to the end.
              </div>
            </div>
            <div className="rounded-lg border border-line bg-panel-2 p-3 sm:col-span-2">
              <div className="label">Rules sheet</div>
              <pre className="whitespace-pre-wrap text-xs text-muted">{rulesValue || "—"}</pre>
            </div>
            <label className="flex items-center gap-2 font-semibold sm:col-span-2">
              <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
              Publish the match now (requires questions assigned)
            </label>
          </div>
        )}

        {/* nav */}
        <div className="mt-5 flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={() => (step === 0 ? router.push("/admin/competitions") : setStep(step - 1))}>
              {step === 0 ? "Cancel" : "← Back"}
            </button>
          </div>
          <div className="flex gap-2">
            {step < STEPS.length - 1 && (
              <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
                Next →
              </button>
            )}
            {step === STEPS.length - 1 && (
              <button className="btn btn-good" disabled={busy || schoolCount < 2 || !planValid} onClick={() => void create()}>
                {busy ? "Creating…" : "Create competition ✓"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
