"use client";

// Game Master entry: pick a match to run. Staff-only.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet, ClientApiError } from "@/lib/client";
import RoleGuide from "@/components/RoleGuide";

type MatchRow = {
  id: string;
  matchNumber: number;
  status: string;
  phase: string;
  competition: { name: string; edition: string | null };
  round: { name: string };
  schools: { school: { name: string; abbreviation: string | null } }[];
  _count: { questions: number };
};

const chipClass = (status: string) =>
  status === "LIVE"
    ? "chip chip-live"
    : status === "READY"
      ? "chip chip-ready"
      : status === "PAUSED"
        ? "chip chip-paused"
        : status === "COMPLETED"
          ? "chip chip-done"
          : "chip chip-draft";

export default function GmIndexPage() {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ matches: MatchRow[] }>("/api/matches")
      .then((d) => setMatches(d.matches))
      .catch((err) => {
        if (err instanceof ClientApiError && err.code === "UNAUTHENTICATED") {
          router.replace("/login");
          return;
        }
        if (err instanceof ClientApiError && err.code === "FORBIDDEN") {
          setError("Game Master or Admin access is required.");
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load matches");
      });
  }, [router]);

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="text-3xl font-bold">Game Master</h1>
      <p className="mt-1 mb-6 text-muted">Select the match you are running.</p>

      <RoleGuide role="GAME_MASTER" />

      {error && (
        <div className="panel border-bad/40 px-4 py-3 text-sm text-bad">{error}</div>
      )}

      {!matches && !error && <div className="text-muted">Loading matches…</div>}

      {matches && matches.length === 0 && (
        <div className="panel px-4 py-8 text-center text-muted">
          No matches yet. Create one in the{" "}
          <Link href="/admin" className="font-semibold text-accent">
            Admin
          </Link>{" "}
          first.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {matches?.map((m) => (
          <Link key={m.id} href={`/gm/${m.id}`} className="panel flex items-center justify-between gap-3 p-4 transition-transform hover:-translate-y-0.5">
            <div className="min-w-0">
              <div className="truncate font-bold">
                {m.competition.name} — {m.round.name} · Match {m.matchNumber}
              </div>
              <div className="mt-1 text-sm text-muted">
                {m.schools.map((s) => s.school.abbreviation ?? s.school.name).join(" vs ")}
                {" · "}
                {m._count.questions} questions
              </div>
            </div>
            <span className={`${chipClass(m.status)} shrink-0`}>{m.status}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
