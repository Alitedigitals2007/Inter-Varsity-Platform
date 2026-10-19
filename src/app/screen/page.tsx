"use client";

// Main screen picker: choose which match to display on the venue screen.

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/client";
import RoleGuide from "@/components/RoleGuide";

type Row = {
  id: string;
  matchNumber: number;
  status: string;
  competition: { name: string };
  round: { name: string };
};

export default function ScreenIndexPage() {
  const [matches, setMatches] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiGet<{ matches: Row[] }>("/api/public/matches")
      .then((d) => setMatches(d.matches))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-16">
      <h1 className="text-2xl font-bold sm:text-3xl">Main Screen</h1>
      <p className="mt-1 mb-6 text-muted">Choose the match to show on the venue display.</p>

      <RoleGuide role="PUBLIC" />
      {!loaded && <div className="text-muted">Loading…</div>}
      {loaded && matches.length === 0 && (
        <div className="panel px-4 py-8 text-center text-muted">No matches available.</div>
      )}
      <div className="flex flex-col gap-3">
        {matches.map((m) => (
          <Link key={m.id} href={`/screen/${m.id}`} className="panel flex items-center justify-between gap-3 p-4 hover:-translate-y-0.5">
            <span className="min-w-0 truncate font-semibold">
              {m.competition.name} — {m.round.name} · Match {m.matchNumber}
            </span>
            <span className={`chip shrink-0 ${m.status === "LIVE" ? "chip-live" : "chip-draft"}`}>{m.status}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
