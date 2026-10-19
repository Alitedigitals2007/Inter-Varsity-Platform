"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend, ClientApiError } from "@/lib/client";

type School = {
  id: string;
  name: string;
  abbreviation: string | null;
  location: string | null;
  active: boolean;
  _count: { accessCodes: number; participants: number };
};

export default function SchoolsPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [abbr, setAbbr] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const d = await apiGet<{ schools: School[] }>("/api/admin/schools");
      setSchools(d.schools);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiSend("/api/admin/schools", "POST", {
        name,
        abbreviation: abbr || undefined,
        location: location || undefined,
      });
      setName("");
      setAbbr("");
      setLocation("");
      await load();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Failed to add school");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(s: School) {
    await apiSend(`/api/admin/schools/${s.id}`, "PATCH", { active: !s.active });
    await load();
  }

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-2xl font-bold sm:text-3xl">Schools</h1>
      <p className="mb-6 text-muted">Permanent registry — reusable across competitions.</p>

      <form onSubmit={add} className="panel mb-6 grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="sname">School name</label>
          <input id="sname" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="sm:w-24">
          <label className="label" htmlFor="sabbr">Abbr.</label>
          <input id="sabbr" className="input" value={abbr} onChange={(e) => setAbbr(e.target.value)} maxLength={12} />
        </div>
        <div className="sm:w-44">
          <label className="label" htmlFor="sloc">Location</label>
          <input id="sloc" className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={busy || !name.trim()}>
          {busy ? "Adding…" : "Add school"}
        </button>
      </form>

      {error && <div className="mb-4 rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>}

      {!loaded ? (
        <div className="text-muted">Loading…</div>
      ) : schools.length === 0 ? (
        <div className="panel px-4 py-8 text-center text-muted">No schools yet — add your first above.</div>
      ) : (
        <div className="panel divide-y divide-line">
          {schools.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <div className="font-semibold">
                  {s.name}
                  {s.abbreviation && <span className="ml-2 text-xs font-bold text-muted">{s.abbreviation}</span>}
                  {!s.active && <span className="ml-2 chip chip-draft">INACTIVE</span>}
                </div>
                <div className="text-xs text-muted">
                  {s.location ?? "—"} · {s._count.accessCodes} codes · {s._count.participants} devices
                </div>
              </div>
              <button className="btn btn-ghost !text-xs shrink-0" onClick={() => void toggle(s)}>
                {s.active ? "Deactivate" : "Activate"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
