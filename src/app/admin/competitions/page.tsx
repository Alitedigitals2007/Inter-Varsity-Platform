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
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>("");

  async function load() {
    const d = await apiGet<{ competitions: Competition[] }>("/api/admin/competitions");
    setItems(d.competitions);
    setLoaded(true);
  }

  async function deleteCompetition(id: string) {
    if (!confirm("Delete this competition? All rounds, matches, questions, and scores will be permanently lost.")) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/admin/competitions/${id}`, "DELETE");
      setItems((prev) => prev.filter((c) => c.id !== id));
      setStatusMsg("Deleted");
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Delete failed");
    } finally {
      setBusy(false);
      setTimeout(() => setStatusMsg(""), 2000);
    }
  }

  useEffect(() => {
    load().catch((e) => {
      setError(e.message);
      setLoaded(true);
    });
  }, []);

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-2xl font-bold sm:text-3xl">Competitions</h1>
      <p className="mb-6 text-muted">Editions, rounds and matches.</p>

      <Link
        href="/admin/competitions/new"
        className="panel mb-6 flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:border-accent-2"
      >
        <div className="min-w-0">
          <div className="font-bold">＋ New competition — guided setup</div>
          <p className="mt-1 text-xs text-muted">
            Pick the format, choose the schools, and the rules generate the rounds, matches and defaults for you.
          </p>
        </div>
        <span className="btn btn-primary pointer-events-none shrink-0">Start →</span>
      </Link>

      {error && <div className="mb-4 rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>}

      {!loaded ? (
        <div className="text-muted">Loading…</div>
      ) : items.length === 0 ? (
        <div className="panel px-4 py-8 text-center text-muted">No competitions yet.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((c) => (
            <div key={c.id} className="flex flex-col gap-2">
              <Link href={`/admin/competitions/${c.id}`} className="panel flex flex-wrap items-center justify-between gap-2 p-4 hover:-translate-y-0.5">
                <div className="min-w-0">
                  <div className="truncate font-bold">
                    {c.name}
                    {c.edition && <span className="ml-2 text-sm font-normal text-muted">{c.edition}</span>}
                  </div>
                  <div className="text-xs text-muted">
                    {c.venue ?? "—"} · {c._count.rounds} rounds · {c._count.matches} matches
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`${statusChip(c.status)} shrink-0`}>{c.status}</span>
                  {c.status !== "LIVE" && (
                    <button
                      className="btn btn-bad !text-xs"
                      disabled={busy}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteCompetition(c.id);
                      }}
                      title="Delete competition"
                    >
                      🗑 Delete
                    </button>
                  )}
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
      {statusMsg && <div className="mt-2 text-center text-xs text-good">{statusMsg}</div>}
    </div>
  );
}
