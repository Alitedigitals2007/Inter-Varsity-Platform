"use client";

// Reports & exports: pick a competition, view a report on screen, download
// it as CSV, or print / save as PDF. Print styles hide the chrome so the
// printed sheet is a clean report.

import { useCallback, useEffect, useState } from "react";

type CompetitionRow = { id: string; name: string; edition: string | null };

type ReportTable = {
  title: string;
  columns: string[];
  rows: (string | number | null)[][];
};

const REPORTS = [
  { value: "summary", label: "Event summary" },
  { value: "standings", label: "Standings" },
  { value: "matches", label: "Match results" },
  { value: "questions", label: "Question by question" },
  { value: "corrections", label: "Corrections & overrides" },
  { value: "timers", label: "Timer overrides" },
] as const;

export default function ReportsPage() {
  const [competitions, setCompetitions] = useState<CompetitionRow[]>([]);
  const [competitionId, setCompetitionId] = useState("");
  const [report, setReport] = useState<(typeof REPORTS)[number]["value"]>("summary");
  const [table, setTable] = useState<ReportTable | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/competitions", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) {
          setCompetitions(json.data.competitions);
          if (json.data.competitions[0] && !competitionId) {
            setCompetitionId(json.data.competitions[0].id);
          }
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!competitionId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/reports?competitionId=${competitionId}&report=${report}&format=json`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load report");
      setTable(json.data as ReportTable);
    } catch (err) {
      setTable(null);
      setError(err instanceof Error ? err.message : "Failed to load report");
    } finally {
      setBusy(false);
    }
  }, [competitionId, report]);

  useEffect(() => {
    void load();
  }, [load]);

  const csvHref = competitionId
    ? `/api/admin/reports?competitionId=${competitionId}&report=${report}&format=csv`
    : "#";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header className="no-print">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Reports & Exports</h1>
        <p className="text-sm text-muted">
          Official results, participation and audit-friendly records. Download CSV or print to PDF.
        </p>
      </header>

      <section className="panel no-print flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-56 flex-1">
          <label className="label" htmlFor="competition">Competition</label>
          <select
            id="competition"
            className="input"
            value={competitionId}
            onChange={(e) => setCompetitionId(e.target.value)}
          >
            <option value="">Select…</option>
            {competitions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.edition ? ` — ${c.edition}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-56 flex-1">
          <label className="label" htmlFor="report">Report</label>
          <select
            id="report"
            className="input"
            value={report}
            onChange={(e) => setReport(e.target.value as (typeof REPORTS)[number]["value"])}
          >
            {REPORTS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <a className={`btn btn-primary ${!competitionId ? "pointer-events-none opacity-50" : ""}`} href={csvHref}>
            Download CSV
          </a>
          <button className="btn btn-ghost" onClick={() => window.print()} disabled={!table}>
            Print / PDF
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>
      )}

      <section className="panel print-plain overflow-x-auto p-4">
        {busy && !table && <div className="text-sm text-muted">Loading report…</div>}
        {!busy && !table && !error && (
          <div className="text-sm text-muted">Pick a competition to generate a report.</div>
        )}
        {table && (
          <>
            <h2 className="mb-3 text-lg font-black">{table.title}</h2>
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr>
                  {table.columns.map((c) => (
                    <th
                      key={c}
                      className="border-b-2 border-line px-2 py-2 text-left text-xs font-black tracking-wider text-muted uppercase"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i} className={i % 2 ? "bg-panel-2/50" : ""}>
                    {row.map((cell, j) => (
                      <td key={j} className="border-b border-line/60 px-2 py-1.5">
                        {cell === null ? "" : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
                {table.rows.length === 0 && (
                  <tr>
                    <td colSpan={table.columns.length} className="px-2 py-4 text-center text-muted">
                      No data for this report yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="mt-3 text-xs text-muted">
              {table.rows.length} row{table.rows.length === 1 ? "" : "s"} · generated{" "}
              {new Date().toLocaleString()}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
