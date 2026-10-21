"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/client";
import RoleGuide from "@/components/RoleGuide";

type Overview = {
  competitions: number;
  liveMatches: {
    id: string;
    matchNumber: number;
    status: string;
    competition: { name: string };
    round: { name: string };
  }[];
  schools: number;
  questions: number;
  categories: number;
  participants: number;
  recentAudit: { id: string; action: string; actorLabel: string | null; createdAt: string }[];
};

function Stat({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const inner = (
    <div className="panel p-5 transition-transform hover:-translate-y-0.5">
      <div className="text-3xl font-black">{value}</div>
      <div className="mt-1 text-xs font-bold tracking-widest text-muted uppercase">{label}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Overview>("/api/admin/overview")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="panel border-bad/40 px-4 py-3 text-sm text-bad">{error}</div>;
  if (!data) return <div className="text-muted">Loading overview…</div>;

  return (
    <div className="max-w-5xl">
      <h1 className="mb-1 text-3xl font-bold">Overview</h1>
      <p className="mb-6 text-muted">Everything at a glance.</p>

      <RoleGuide role="ADMIN" />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Competitions" value={data.competitions} href="/admin/competitions" />
        <Stat label="Schools" value={data.schools} href="/admin/schools" />
        <Stat label="Questions" value={data.questions} href="/admin/questions" />
        <Stat label="Categories" value={data.categories} href="/admin/questions" />
        <Stat label="Devices" value={data.participants} />
        <Stat label="Codes" value="→" href="/admin/access-codes" />
      </div>

      <div className="mt-4">
        <Link href="/admin/show" className="panel flex items-center justify-between p-4 hover:-translate-y-0.5">
          <span>
            <span className="block text-sm font-bold">Show Director</span>
            <span className="block text-xs text-muted">
              Live broadcast show: logos, sponsors, countdown, ticker — for the venue screen
            </span>
          </span>
          <span className="chip chip-ready">Compose →</span>
        </Link>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-bold">Active matches</h2>
          {data.liveMatches.length === 0 ? (
            <div className="panel px-4 py-6 text-sm text-muted">No active matches.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {data.liveMatches.map((m) => (
                <Link key={m.id} href={`/gm/${m.id}`} className="panel flex items-center justify-between gap-3 p-3 hover:-translate-y-0.5">
                  <span className="min-w-0 truncate text-sm font-semibold">
                    {m.competition.name}
                  </span>
                  <span className={`chip shrink-0 ${m.status === "LIVE" ? "chip-live" : m.status === "PAUSED" ? "chip-paused" : "chip-ready"}`}>
                    {m.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div>
          <h2 className="mb-3 text-lg font-bold">Recent activity</h2>
          <div className="panel max-h-80 overflow-y-auto p-3 font-mono text-xs">
            {data.recentAudit.length === 0 && <div className="text-muted">No activity yet.</div>}
            {data.recentAudit.map((a) => (
              <div key={a.id} className="flex justify-between gap-2 border-b border-line/50 py-1.5 last:border-0">
                <span className="min-w-0 truncate">{a.action}</span>
                <span className="shrink-0 text-muted">{a.actorLabel ?? "system"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
