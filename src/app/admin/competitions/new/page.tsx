"use client";

// Competition setup wizard — League of Rounds only. One competition is one
// league match: every school plays the same board, scores accumulate, and the
// whole competition runs on a single page. No categories, no round pages.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiSend, ClientApiError } from "@/lib/client";
import { FORMAT_PRESETS, buildRulesText } from "@/lib/formats";

const FORMAT = "LEAGUE_ROUNDS" as const;

type School = { id: string; name: string; abbreviation: string | null; active: boolean };
type Question = { id: string; active: boolean };

const STEPS = ["Basics", "Game rules", "Schools", "Review"] as const;

export default function NewCompetitionWizard() {
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [edition, setEdition] = useState("");
  const [venue, setVenue] = useState("");
  const [organizer, setOrganizer] = useState("");

  const [schoolIds, setSchoolIds] = useState<string[]>([]);
  const [questionsPerSchool, setQuestionsPerSchool] = useState("3");
  const [answerSec, setAnswerSec] = useState("30");
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [autoAdvanceSec, setAutoAdvanceSec] = useState("5");
  const [sound, setSound] = useState(true);
  const [rulesText, setRulesText] = useState("");
  const [rulesEdited, setRulesEdited] = useState(false);
  const [publish, setPublish] = useState(true);

  const [schools, setSchools] = useState<School[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);

  useEffect(() => {
    apiGet<{ schools: School[] }>("/api/admin/schools").then((d) => setSchools(d.schools)).catch(() => {});
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
  const perSchool = Math.max(1, Number(questionsPerSchool) || 1);
  const totalQuestions = perSchool * Math.max(schoolCount, 1);
  const activeQuestions = useMemo(
    () => questions.filter((q) => q.active).length,
    [questions]
  );

  const generatedRules = useMemo(
    () =>
      buildRulesText(FORMAT, {
        schoolCount: Math.max(schoolCount, 2),
        perSchoolTurns: perSchool,
        qualifyCount: null,
        eliminateCount: null,
        answerSec: Number(answerSec) || undefined,
      }),
    [schoolCount, perSchool, answerSec]
  );
  const rulesValue = rulesEdited ? rulesText : generatedRules;

  const canNext =
    (step === 0 && name.trim() !== "") ||
    (step === 1 && perSchool >= 1) ||
    (step === 2 && schoolCount >= 2) ||
    step === 3;

  async function create() {
    if (schoolCount < 2) return;
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
        rules: rulesValue.trim() || null,
        schoolIds,
        selectionMethod: "BOARD",
        config,
        questionsPerSchool: perSchool,
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
        League of rounds — one match, one board, one page. Every school plays the same questions and
        scores accumulate.
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
              <label className="label" htmlFor="qps">Questions per school</label>
              <input
                id="qps"
                className="input"
                type="number"
                min={1}
                max={100}
                value={questionsPerSchool}
                onChange={(e) => setQuestionsPerSchool(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted">
                Board holds {totalQuestions} question{totalQuestions === 1 ? "" : "s"} for{" "}
                {Math.max(schoolCount, 2)} school{Math.max(schoolCount, 2) === 1 ? "" : "s"} ·{" "}
                {activeQuestions} active in the bank.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="asec">Answer time (seconds)</label>
              <input id="asec" className="input" type="number" min={5} max={600} value={answerSec} onChange={(e) => setAnswerSec(e.target.value)} />
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
                  <b>All {schoolCount} schools</b> play together in one match. Every school answers{" "}
                  <b>{perSchool}</b> question{perSchool === 1 ? "" : "s"}; scores accumulate to the end.
                </div>
                <div className="mt-1 text-muted">
                  Turn order: {schoolIds.map(schoolLabel).join(" → ")}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 4 review ── */}
        {step === 3 && (
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-panel-2 p-3">
              <div className="label">Competition</div>
              <div className="font-bold">{name || "—"}{edition && ` · ${edition}`}</div>
              <div className="text-muted">{venue || "no venue"} · {organizer || "no organizer"}</div>
              <div className="mt-1">Format: <b>{FORMAT_PRESETS[FORMAT].label}</b></div>
            </div>
            <div className="rounded-lg border border-line bg-panel-2 p-3">
              <div className="label">Game rules</div>
              <div>Questions per school: <b>{perSchool}</b></div>
              <div>Answer time: <b>{answerSec}s</b> · Auto-advance: <b>{autoAdvance ? `${autoAdvanceSec}s` : "off"}</b></div>
              <div>Sound: <b>{sound ? "on" : "off"}</b> · Questions on board: <b>{totalQuestions}</b></div>
            </div>
            <div className="rounded-lg border border-line bg-panel-2 p-3 sm:col-span-2">
              <div className="label">One page, one match</div>
              <div>
                <b>{schoolCount} school(s)</b> in one league match — no category pages, no round pages.
                Questions are pulled automatically from the active question bank; scores accumulate on
                the same screen from start to finish.
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
              <button className="btn btn-good" disabled={busy || schoolCount < 2} onClick={() => void create()}>
                {busy ? "Creating…" : "Create competition ✓"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
