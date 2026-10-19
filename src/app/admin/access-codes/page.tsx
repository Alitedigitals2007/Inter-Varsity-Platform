"use client";

// Access codes (spec §12.2): generate, revoke, regenerate, expire. Codes are
// scoped to a competition (optionally a match) and limited by device count.

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend, ClientApiError } from "@/lib/client";

type Competition = { id: string; name: string; edition: string | null };
type School = { id: string; name: string; abbreviation: string | null; active: boolean };
type Code = {
  id: string;
  code: string;
  status: string;
  maxDevices: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  school: { name: string; abbreviation: string | null };
  competition: { name: string };
};

export default function AccessCodesPage() {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [codes, setCodes] = useState<Code[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [schoolId, setSchoolId] = useState("");
  const [competitionId, setCompetitionId] = useState("");
  const [maxDevices, setMaxDevices] = useState("1");
  const [busy, setBusy] = useState(false);
  const [justCreated, setJustCreated] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, s, k] = await Promise.all([
      apiGet<{ competitions: Competition[] }>("/api/admin/competitions"),
      apiGet<{ schools: School[] }>("/api/admin/schools"),
      apiGet<{ codes: Code[] }>("/api/admin/access-codes"),
    ]);
    setCompetitions(c.competitions);
    setSchools(s.schools);
    setCodes(k.codes);
    if (!competitionId && c.competitions[0]) setCompetitionId(c.competitions[0].id);
  }, [competitionId]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  async function guard(fn: () => Promise<unknown>, msg?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (msg) setNotice(msg);
      await load();
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    await guard(async () => {
      const d = await apiSend<{ accessCode: Code }>("/api/admin/access-codes", "POST", {
        schoolId,
        competitionId,
        maxDevices: Number(maxDevices) || 1,
      });
      setJustCreated(d.accessCode.code);
      setSchoolId("");
    }, "Access code generated");
  }

  async function act(id: string, action: "REVOKE" | "REGENERATE" | "EXPIRE") {
    if (action === "REVOKE" && !confirm("Revoke this code? Devices using it will lose access on next validation.")) return;
    if (action === "REGENERATE" && !confirm("Regenerate this code? The old code stops working immediately.")) return;
    await guard(() => apiSend("/api/admin/access-codes", "PATCH", { id, action }), `${action.toLowerCase()} done`);
  }

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-3xl font-bold">Access Codes</h1>
      <p className="mb-6 text-muted">School devices join competitions with these codes.</p>

      {error && <div className="mb-4 rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>}
      {notice && <div className="mb-4 rounded-md border border-good/40 bg-good/10 px-3 py-2 text-sm text-good">{notice}</div>}

      <form onSubmit={generate} className="panel mb-6 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="acc-s">School</label>
          <select id="acc-s" className="input" value={schoolId} onChange={(e) => setSchoolId(e.target.value)} required>
            <option value="">Pick…</option>
            {schools.filter((s) => s.active).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="acc-c">Competition</label>
          <select id="acc-c" className="input" value={competitionId} onChange={(e) => setCompetitionId(e.target.value)} required>
            <option value="">Pick…</option>
            {competitions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.edition ? ` ${c.edition}` : ""}</option>
            ))}
          </select>
        </div>
        <div className="w-24">
          <label className="label" htmlFor="acc-d">Devices</label>
          <input id="acc-d" className="input" type="number" min={1} max={20} value={maxDevices} onChange={(e) => setMaxDevices(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={busy || !schoolId || !competitionId}>Generate</button>
      </form>

      {justCreated && (
        <div className="panel mb-6 border-accent/60 p-5 text-center">
          <div className="text-xs font-bold tracking-widest text-muted uppercase">New access code</div>
          <div className="mt-1 font-mono text-3xl font-black tracking-[0.2em] text-accent">{justCreated}</div>
          <div className="mt-2 text-xs text-muted">Share this with the school's device.</div>
        </div>
      )}

      <div className="panel divide-y divide-line">
        {codes.length === 0 && <div className="px-4 py-8 text-center text-muted">No codes generated yet.</div>}
        {codes.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <div className="font-mono text-lg font-bold tracking-wider">{c.code}</div>
              <div className="text-xs text-muted">
                {c.school.abbreviation ?? c.school.name} · {c.competition.name} · {c.maxDevices} device(s)
                {c.lastUsedAt && ` · last used ${new Date(c.lastUsedAt).toLocaleString()}`}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`chip ${c.status === "ACTIVE" ? "chip-live" : c.status === "REVOKED" ? "chip-paused" : "chip-draft"}`}>
                {c.status}
              </span>
              {c.status === "ACTIVE" && (
                <>
                  <button className="btn btn-ghost !px-3 !py-1.5 !text-xs" onClick={() => void act(c.id, "REGENERATE")}>Regenerate</button>
                  <button className="btn btn-ghost !px-3 !py-1.5 !text-xs" onClick={() => void act(c.id, "REVOKE")}>Revoke</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
