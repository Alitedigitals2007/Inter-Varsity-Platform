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
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [abbr, setAbbr] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);

  // bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = schools.length > 0 && schools.every((s) => selected.has(s.id));

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
    setNotice(null);
    try {
      await apiSend("/api/admin/schools", "POST", {
        name,
        abbreviation: abbr || undefined,
        location: location || undefined,
      });
      setName("");
      setAbbr("");
      setLocation("");
      setNotice("School added");
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

  async function runBulkDelete(payload: { ids?: string[]; all?: boolean }, label: string) {
    if (!payload.all && (!payload.ids || payload.ids.length === 0)) return;
    if (!confirm(`${label} Schools that have played a match are skipped. This cannot be undone.`))
      return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const d = await apiSend<{ deleted: number; skipped: number }>(
        "/api/admin/schools/bulk",
        "DELETE",
        payload
      );
      setSelected(new Set());
      setNotice(
        `Deleted ${d.deleted} school(s)` +
          (d.skipped ? ` · ${d.skipped} skipped (registered in a match)` : "")
      );
      await load();
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  const bulkDelete = () =>
    runBulkDelete({ ids: [...selected] }, `Delete ${selected.size} school(s) permanently?`);

  const deleteAllSchools = () =>
    runBulkDelete({ all: true }, "Delete ALL schools that have never played a match?");

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
      {notice && <div className="mb-4 rounded-md border border-good/40 bg-good/10 px-3 py-2 text-sm text-good">{notice}</div>}

      {!loaded ? (
        <div className="text-muted">Loading…</div>
      ) : schools.length === 0 ? (
        <div className="panel px-4 py-8 text-center text-muted">No schools yet — add your first above.</div>
      ) : (
        <div className="panel">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(schools.map((s) => s.id)))}
              />
              <span className="font-semibold">Select all</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn btn-bad !text-xs"
                disabled={busy || selected.size === 0}
                onClick={() => void bulkDelete()}
              >
                🗑 Delete selected ({selected.size})
              </button>
              <button
                className="btn btn-ghost !text-xs"
                disabled={busy || schools.length === 0}
                onClick={() => void deleteAllSchools()}
              >
                Delete all unused
              </button>
            </div>
          </div>
          <div className="divide-y divide-line">
            {schools.map((s) => (
              <div
                key={s.id}
                className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${selected.has(s.id) ? "bg-accent/5" : ""}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggleSelect(s.id)}
                    className="shrink-0"
                  />
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
                </div>
                <button className="btn btn-ghost !text-xs shrink-0" onClick={() => void toggle(s)}>
                  {s.active ? "Deactivate" : "Activate"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
