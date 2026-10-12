"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend, ClientApiError } from "@/lib/client";

type Competition = {
  id: string;
  name: string;
  edition: string | null;
  venue: string | null;
  status: string;
  startsAt: string | null;
  _count: { rounds: number; matches: number };
};

const statusChip = (s: string) =>
  s === "LIVE" ? "chip chip-live" : s === "READY" ? "chip chip-ready" : s === "DRAFT" ? "chip chip-draft" : "chip chip-done";

export default function CompetitionsPage() {
  const [items, setItems] = useState<Competition[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", edition: "", venue: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    const d = await apiGet<{ competitions: Competition[] }>("/api/admin/competitions");
    setItems(d.competitions);
    setLoaded(true);
  }

  useEffect(() => {
    load().catch((e) => {
      setError(e.message);
      setLoaded(true);
    });
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiSend("/api/admin/competitions", "POST", {
        name: form.name,
        edition: form.edition || undefined,
        venue: form.venue || undefined,
      });
      setForm({ name: "", edition: "", venue: "" });
      await load();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Failed to create");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-3xl font-bold">Competitions</h1>
      <p className="mb-6 text-muted">Editions, rounds and matches.</p>

      <form onSubmit={create} className="panel mb-6 grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="cname">Name</label>
          <input id="cname" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="w-40">
          <label className="label" htmlFor="cedition">Edition</label>
          <input id="cedition" className="input" placeholder="2026" value={form.edition} onChange={(e) => setForm({ ...form, edition: e.target.value })} />
        </div>
        <div className="w-44">
          <label className="label" htmlFor="cvenue">Venue</label>
          <input id="cvenue" className="input" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
        </div>
        <button className="btn btn-primary" disabled={busy || !form.name.trim()}>
          {busy ? "Creating…" : "Create"}
        </button>
      </form>

      {error && <div className="mb-4 rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>}

      {!loaded ? (
        <div className="text-muted">Loading…</div>
      ) : items.length === 0 ? (
        <div className="panel px-4 py-8 text-center text-muted">No competitions yet.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((c) => (
            <Link key={c.id} href={`/admin/competitions/${c.id}`} className="panel flex items-center justify-between p-4 hover:-translate-y-0.5">
              <div>
                <div className="font-bold">
                  {c.name}
                  {c.edition && <span className="ml-2 text-sm font-normal text-muted">{c.edition}</span>}
                </div>
                <div className="text-xs text-muted">
                  {c.venue ?? "—"} · {c._count.rounds} rounds · {c._count.matches} matches
                </div>
              </div>
              <span className={statusChip(c.status)}>{c.status}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
