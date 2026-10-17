"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/client";

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

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-3xl font-bold">Competitions</h1>
      <p className="mb-6 text-muted">Editions, rounds and matches.</p>

      <Link
        href="/admin/competitions/new"
        className="panel mb-6 flex items-center justify-between p-4 transition-colors hover:border-accent-2"
      >
        <div>
          <div className="font-bold">＋ New competition — guided setup</div>
          <p className="mt-1 text-xs text-muted">
            Pick the format, choose the schools, and the rules generate the rounds, matches and defaults for you.
          </p>
        </div>
        <span className="btn btn-primary pointer-events-none">Start →</span>
      </Link>

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
