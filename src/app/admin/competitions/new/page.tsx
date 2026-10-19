"use client";

// Competition setup wizard — the "one flow": Basics → Format → Schools →
// Rules & game → Questions → Review. The chosen format + school count
// determines the rounds and matches (see planStructure); the game settings
// generate a plain-language rules sheet the admin can edit. One request
// creates and (optionally) publishes everything.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiSend, ClientApiError } from "@/lib/client";
import {
  FORMAT_DEFAULTS,
  FORMAT_PRESETS,
  buildRulesText,
  planStructure,
  type FormatKey,
} from "@/lib/formats";

type School = { id: string; name: string; abbreviation: string | null; active: boolean };
type Category = { id: string; name: string; _count: { questions: number } };
type Question = {
  id: string;
  text: string;
  defaultPoints: number;
  active: boolean;
  category: { id: string; name: string };
};

const STEPS = ["Basics", "Format", "Schools", "Rules & game", "Questions", "Review"] as const;

export default function NewCompetitionWizard() {
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [edition, setEdition] = useState("");
  const [venue, setVenue] = useState("");
  const [organizer, setOrganizer] = useState("");

  const [format, setFormat] = useState<FormatKey | "">("");
  const [roundsCount, setRoundsCount] = useState("2");
  const [schoolIds, setSchoolIds] = useState<string[]>([]);

  const [answerSec, setAnswerSec] = useState("30");
  const [qualifyCount, setQualifyCount] = useState("");
  const [eliminateCount, setEliminateCount] = useState("");
  const [qualifyTouched, setQualifyTouched] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [autoAdvanceSec, setAutoAdvanceSec] = useState("5");
  const [sound, setSound] = useState(true);
  const [rulesText, setRulesText] = useState("");
  const [rulesEdited, setRulesEdited] = useState(false);

  // Per-category question plan: boardTotal = questions drawn into each match,
  // perSchool = questions each school answers from that category.
  const [catPlan, setCatPlan] = useState<Record<string, { boardTotal: string; perSchool: string }>>({});
  const [points, setPoints] = useState<number | null>(null);
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
  const plan = useMemo(
    () =>
      format && schoolCount >= 2
        ? planStructure(format, schoolIds, { roundsCount: Number(roundsCount) || 1 })
        : null,
    [format, schoolIds, roundsCount, schoolCount]
  );
  const totalMatches = plan?.rounds.reduce((n, r) => n + r.matches.length, 0) ?? 0;
  const maxMatchSchools =
    plan && plan.rounds.length > 0
      ? Math.max(...plan.rounds.flatMap((r) => r.matches.map((m) => m.schoolIds.length)))
      : Math.max(schoolCount, 2);

  // ── Per-category question plan ─────────────────────────────────
  const bankCount = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const q of questions) {
      if (q.active) byCategory.set(q.category.id, (byCategory.get(q.category.id) ?? 0) + 1);
    }
    return byCategory;
  }, [questions]);

  const planRow = (categoryId: string) =>
    catPlan[categoryId] ?? { boardTotal: "", perSchool: "" };

  function setPlanRow(categoryId: string, patch: Partial<{ boardTotal: string; perSchool: string }>) {
    setCatPlan((prev) => ({ ...prev, [categoryId]: { ...planRow(categoryId), ...patch } }));
  }

  const planRows = useMemo(
    () =>
      categories
        .map((c) => {
          const row = catPlan[c.id];
          const boardTotal = Number(row?.boardTotal) || 0;
          const perSchool = Number(row?.perSchool) || 0;
          return { categoryId: c.id, name: c.name, boardTotal, perSchool };
        })
        .filter((r) => r.boardTotal > 0 || r.perSchool > 0),
    [categories, catPlan]
  );

  function planRowError(r: { categoryId: string; name: string; boardTotal: number; perSchool: number }): string | null {
    if (r.perSchool < 1) return "Set the questions per school (at least 1).";
    if (r.boardTotal < 1) return "Set the board total (at least 1).";
    const need = r.perSchool * maxMatchSchools;
    if (r.boardTotal < need) {
      return `${maxMatchSchools} school(s) × ${r.perSchool} = ${need} needed, but the board holds ${r.boardTotal}.`;
    }
    const bank = bankCount.get(r.categoryId) ?? 0;
    if (r.boardTotal > bank) {
      return `Only ${bank} active question(s) in the bank — the board asks for ${r.boardTotal}.`;
    }
    return null;
  }

  const planErrors = planRows.map(planRowError);
  const planValid = planRows.length > 0 && planErrors.every((e) => e === null);
  const turnsPerSchool = planRows.reduce((n, r) => n + r.perSchool, 0);

  // "The rule determines the rest": qualify/eliminate defaults follow the
  // format (and school count) until the admin edits them.
  const defaultQualify = !format
    ? ""
    : format === "KNOCKOUT"
      ? "1"
      : format === "TOP_N_FINAL"
        ? String(Math.min(4, Math.max(2, Math.max(schoolCount, 2) - 1)))
        : "";
  const defaultEliminate = format === "KNOCKOUT" ? "1" : "";
  const effectiveQualify = qualifyTouched ? qualifyCount : defaultQualify;
  const effectiveEliminate = qualifyTouched ? eliminateCount : defaultEliminate;

  const generatedRules = useMemo(
    () =>
      format
        ? buildRulesText(format, {
            schoolCount: Math.max(schoolCount, 2),
            perSchoolTurns: turnsPerSchool,
            qualifyCount: effectiveQualify === "" ? null : Number(effectiveQualify),
            eliminateCount: effectiveEliminate === "" ? null : Number(effectiveEliminate),
            answerSec: Number(answerSec) || undefined,
            categories: planRows.map((r) => ({ name: r.name, perSchool: r.perSchool, boardTotal: r.boardTotal })),
          })
        : "",
    [format, schoolCount, turnsPerSchool, effectiveQualify, effectiveEliminate, answerSec, planRows]
  );
  const rulesValue = rulesEdited ? rulesText : generatedRules;

  function pickFormat(key: FormatKey) {
    setFormat(key);
    const d = FORMAT_DEFAULTS[key];
    setRoundsCount(String(d.roundsCount));
    setQualifyTouched(false);
  }

  const canNext =
    (step === 0 && name.trim() !== "") ||
    (step === 1 && format !== "") ||
    (step === 2 && schoolCount >= 2) ||
    step === 3 ||
    (step === 4 && planValid) ||
    step === 5;

  async function create() {
    if (!format) return;
    setBusy(true);
    setError(null);
    try {
      const config: Record<string, unknown> = {};
      if (Number(answerSec) > 0) config.timers = { answerSec: Number(answerSec) };
      config.qualification = {
        qualifyCount: effectiveQualify === "" ? null : Number(effectiveQualify),
        eliminateCount:
          effectiveEliminate === "" || Number(effectiveEliminate) === 0 ? null : Number(effectiveEliminate),
      };
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
        format,
        rules: rulesValue.trim() || null,
        roundsCount: format === "LEAGUE_ROUNDS" || format === "TOP_N_FINAL" ? Number(roundsCount) || 1 : undefined,
        schoolIds,
        selectionMethod: "BOARD",
        config,
        questionPlan: planRows.map((r) => ({
          categoryId: r.categoryId,
          boardTotal: r.boardTotal,
          perSchool: r.perSchool,
        })),
        pointValue: points !== null && points > 0 ? points : undefined,
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
        One guided flow — the format and the rules determine the rounds, matches and defaults.
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

        {/* ── 2 format ── */}
        {step === 1 && (
          <div>
            <div className="mb-3 text-xs font-bold tracking-widest text-muted uppercase">Competition format</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.entries(FORMAT_PRESETS) as [FormatKey, { label: string; blurb: string }][]).map(
                ([key, preset]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => pickFormat(key)}
                    className={`rounded-xl border-2 p-3 text-left transition-colors ${
                      format === key ? "border-accent bg-accent/10" : "border-line bg-panel-2 hover:border-accent-2"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm font-bold">
                      <span className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${format === key ? "border-accent bg-accent" : "border-line"}`} />
                      {preset.label}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{preset.blurb}</p>
                  </button>
                )
              )}
            </div>
            {format && (format === "LEAGUE_ROUNDS" || format === "TOP_N_FINAL") && (
              <div className="mt-4 w-full sm:w-52">
                <label className="label" htmlFor="rcd">
                  {format === "LEAGUE_ROUNDS" ? "Number of rounds" : "Preliminary rounds"}
                </label>
                <input
                  id="rcd"
                  className="input"
                  type="number"
                  min={1}
                  max={20}
                  value={roundsCount}
                  onChange={(e) => setRoundsCount(e.target.value)}
                />
              </div>
            )}
            {format && <StructurePreview plan={plan} label={schoolLabel} schoolCount={schoolCount} />}
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
            {format && <StructurePreview plan={plan} label={schoolLabel} schoolCount={schoolCount} />}
          </div>
        )}

        {/* ── 4 rules & game ── */}
        {step === 3 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="label">Turns per school (per match)</div>
              <div className="input flex items-center justify-between !bg-panel-2">
                <span className="font-bold">{turnsPerSchool || "—"}</span>
                <span className="text-xs text-muted">from the Questions step</span>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="asec">Answer time (seconds)</label>
              <input id="asec" className="input" type="number" min={5} max={600} value={answerSec} onChange={(e) => setAnswerSec(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="qc">Qualify — top N (blank = none)</label>
              <input id="qc" className="input" type="number" min={0} max={64} value={effectiveQualify} placeholder="none"
                onChange={(e) => { setQualifyTouched(true); setQualifyCount(e.target.value); }} />
            </div>
            <div>
              <label className="label" htmlFor="ec">Eliminate — bottom N (blank = none)</label>
              <input id="ec" className="input" type="number" min={0} max={64} value={effectiveEliminate} placeholder="none"
                onChange={(e) => { setQualifyTouched(true); setEliminateCount(e.target.value); }} />
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
                <label className="label !mb-0" htmlFor="rules">Rules sheet (generated from the format — edit freely)</label>
                {rulesEdited && format && (
                  <button type="button" className="text-xs text-accent-2 hover:underline" onClick={() => setRulesEdited(false)}>
                    ↻ Regenerate from format
                  </button>
                )}
              </div>
              <textarea
                id="rules"
                className="input min-h-36"
                value={rulesValue}
                onChange={(e) => { setRulesEdited(true); setRulesText(e.target.value); }}
              />
              <p className="mt-1 text-xs text-muted">Shown to schools before every game and on the venue screen.</p>
            </div>
          </div>
        )}

        {/* ── 5 questions ── */}
        {step === 4 && (
          <div>
            <p className="mb-3 text-sm text-muted">
              Set, per category, how many questions go on the board of every match and how many each
              school answers. Questions are pulled from the bank automatically — different matches get
              different questions while the bank allows.
            </p>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-panel-2 text-left text-xs text-muted">
                    <th className="px-3 py-2 font-bold">Category</th>
                    <th className="px-3 py-2 font-bold">In bank</th>
                    <th className="px-3 py-2 font-bold">Board total</th>
                    <th className="px-3 py-2 font-bold">Per school</th>
                    <th className="px-3 py-2 font-bold">Needed</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => {
                    const row = planRow(c.id);
                    const boardTotal = Number(row.boardTotal) || 0;
                    const perSchool = Number(row.perSchool) || 0;
                    const active = boardTotal > 0 || perSchool > 0;
                    const bank = bankCount.get(c.id) ?? 0;
                    const needed = perSchool * maxMatchSchools;
                    const rowError = active
                      ? planRowError({ categoryId: c.id, name: c.name, boardTotal, perSchool })
                      : null;
                    return (
                      <tr key={c.id} className={`border-b border-line/50 last:border-0 ${rowError ? "bg-bad/5" : ""}`}>
                        <td className="px-3 py-2 font-semibold">{c.name}</td>
                        <td className={`px-3 py-2 font-mono text-xs ${bank === 0 ? "text-bad" : "text-muted"}`}>{bank}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number" min={0} max={500} className="input !w-24 !py-1 !text-xs"
                            value={row.boardTotal}
                            onChange={(e) => setPlanRow(c.id, { boardTotal: e.target.value })}
                            placeholder="0"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number" min={0} max={100} className="input !w-20 !py-1 !text-xs"
                            value={row.perSchool}
                            onChange={(e) => setPlanRow(c.id, { perSchool: e.target.value })}
                            placeholder="0"
                          />
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-muted">
                          {active ? needed : "—"}
                          {rowError && <div className="mt-0.5 max-w-56 font-sans text-bad">{rowError}</div>}
                        </td>
                      </tr>
                    );
                  })}
                  {categories.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-sm text-muted">
                        No categories yet — add them in the Question Bank first.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
              <span>
                Each school answers <b className="text-foreground">{turnsPerSchool || 0}</b> question(s) per match ·
                needed is per school × {maxMatchSchools} school(s) in the biggest match.
              </span>
              <label className="ml-auto flex items-center gap-2">
                Points per question (blank = each question&apos;s own value)
                <input type="number" min={0} max={1000} className="input !w-20 !py-1 !text-xs"
                  placeholder="auto" value={points ?? ""}
                  onChange={(e) => setPoints(e.target.value === "" ? null : Number(e.target.value))} />
              </label>
            </div>
            {planRows.length === 0 && (
              <p className="mt-2 text-xs text-warn">
                Set at least one category (questions per school) to continue.
              </p>
            )}
            {planRows.length > 0 && !planValid && (
              <p className="mt-2 text-xs text-bad">
                Fix the highlighted rows to continue — or top up the Question Bank.
              </p>
            )}
          </div>
        )}

        {/* ── 6 review ── */}
        {step === 5 && (
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-panel-2 p-3">
              <div className="label">Competition</div>
              <div className="font-bold">{name || "—"}{edition && ` · ${edition}`}</div>
              <div className="text-muted">{venue || "no venue"} · {organizer || "no organizer"}</div>
              <div className="mt-1">Format: <b>{format ? FORMAT_PRESETS[format].label : "—"}</b></div>
            </div>
            <div className="rounded-lg border border-line bg-panel-2 p-3">
              <div className="label">Game rules</div>
              <div>Turns per school: <b>{turnsPerSchool || "—"}</b> · Answer time: <b>{answerSec}s</b></div>
              <div>Qualify: <b>{effectiveQualify || "none"}</b> · Eliminate: <b>{effectiveEliminate || "none"}</b></div>
              <div>Auto-advance: <b>{autoAdvance ? `${autoAdvanceSec}s` : "off"}</b> · Sound: <b>{sound ? "on" : "off"}</b></div>
            </div>
            <div className="rounded-lg border border-line bg-panel-2 p-3 sm:col-span-2">
              <div className="label">Questions by category</div>
              {planRows.length > 0 ? (
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  {planRows.map((r) => (
                    <span key={r.categoryId}>
                      <b>{r.name}</b>{" "}
                      <span className="text-muted">{r.perSchool}/school · {r.boardTotal} on the board</span>
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-muted">Set the per-category counts in the Questions step.</span>
              )}
            </div>
            <div className="rounded-lg border border-line bg-panel-2 p-3 sm:col-span-2">
              <div className="label">Structure — {totalMatches} match(es)</div>
              {plan ? (
                <>
                  {plan.rounds.map((r) => (
                    <div key={r.name} className="mb-1">
                      <b>{r.name}</b>{" "}
                      <span className="text-muted">
                        {r.matches.map((m) => m.schoolIds.map(schoolLabel).join(" · ")).join("  |  ")}
                      </span>
                    </div>
                  ))}
                  {plan.notes.map((n) => (
                    <p key={n} className="text-xs text-muted">• {n}</p>
                  ))}
                </>
              ) : (
                <span className="text-muted">Pick a format and at least 2 schools.</span>
              )}
            </div>
            <div className="rounded-lg border border-line bg-panel-2 p-3 sm:col-span-2">
              <div className="label">Rules sheet</div>
              <pre className="whitespace-pre-wrap text-xs text-muted">{rulesValue || "—"}</pre>
            </div>
            <label className="flex items-center gap-2 font-semibold sm:col-span-2">
              <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
              Publish matches now (requires questions assigned)
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
              <button className="btn btn-good" disabled={busy || !plan || !planValid} onClick={() => void create()}>
                {busy ? "Creating…" : "Create competition ✓"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StructurePreview({
  plan,
  label,
  schoolCount,
}: {
  plan: ReturnType<typeof planStructure> | null;
  label: (id: string) => string;
  schoolCount: number;
}) {
  if (schoolCount < 2) return null;
  if (!plan) return null;
  return (
    <div className="mt-4 rounded-lg border border-line bg-panel-2 p-3 text-sm">
      <div className="mb-2 text-xs font-bold tracking-widest text-muted uppercase">
        Structure preview — {plan.rounds.length} round(s)
      </div>
      {plan.rounds.map((r) => (
        <div key={r.name} className="mb-1">
          <b>{r.name}</b>{" "}
          <span className="text-muted">
            {r.matches.map((m) => m.schoolIds.map(label).join(" · ")).join("  |  ")}
          </span>
        </div>
      ))}
      {plan.notes.map((n) => (
        <p key={n} className="mt-1 text-xs text-muted">• {n}</p>
      ))}
    </div>
  );
}
