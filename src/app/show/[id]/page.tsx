"use client";

// Public sponsor & show preview (no auth) — share this link with sponsors so
// they can see exactly how their branding will appear at the venue, in each
// phase of the event. This page never touches match state.

import { use, useEffect, useState } from "react";
import ShowStage, { type StageSegment, type StageSponsorInfo, type StageSchool } from "@/components/stage/ShowStage";

type PreviewData = {
  competition: {
    name: string;
    logoUrl: string | null;
    venue: string | null;
    edition: string | null;
    startsAt: string | null;
    rules: string | null;
  };
  round: string;
  matchNumber: number;
  schools: StageSchool[];
  sponsors: StageSponsorInfo[];
  segments: StageSegment[];
  defaults: boolean;
};

const MODES = [
  { value: "pre", label: "Pre-game" },
  { value: "break", label: "Break" },
  { value: "overlays", label: "In-game overlays" },
] as const;

export default function ShowPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<(typeof MODES)[number]["value"]>("pre");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/matches/${id}/show`, { cache: "no-store" })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error?.message ?? "Could not load the show");
        return json;
      })
      .then((json) => {
        if (!cancelled && json.ok) setData(json.data as PreviewData);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-muted">
        <div className="text-center">
          <div className="mb-2 font-bold text-bad">{error}</div>
          <div className="text-sm">Ask the organizers for a fresh preview link.</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="flex flex-1 items-center justify-center text-muted">Loading preview…</div>;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs font-bold tracking-widest text-muted uppercase">
            Sponsor & show preview
          </div>
          <div className="truncate font-bold">
            {data.competition.name} — {data.round} · Match {data.matchNumber}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`btn !py-1.5 !text-xs ${mode === m.value ? "btn-primary" : "btn-ghost"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative flex-1" style={{ minHeight: "56.25vw" }}>
        <div className="absolute inset-0">
          <ShowStage
            mode={mode}
            competitionName={data.competition.name}
            competitionLogoUrl={data.competition.logoUrl}
            venue={data.competition.venue}
            edition={data.competition.edition}
            startsAt={data.competition.startsAt}
            rules={data.competition.rules}
            round={data.round}
            matchNumber={data.matchNumber}
            schools={data.schools}
            sponsors={data.sponsors}
            segments={data.segments}
            defaults={data.defaults}
          />
        </div>
      </div>
    </div>
  );
}
