"use client";

// Live-show stage: the venue's broadcast package.
// Plays an admin-composed (or built-in default) sequence of animated
// segments before the match and between rounds; during play it renders
// only lightweight overlays (sponsor bug, animated border).
//
// All motion is CSS/GPU-composited; the server is never in the render loop.

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

export type StageSponsorInfo = {
  brandName: string;
  logoUrl: string | null;
  website?: string | null;
  description?: string | null;
  brandColors?: Record<string, string> | null;
  tier?: string | null;
};

export type StageSegment = {
  id: string;
  type: string;
  placement: string;
  durationSec: number;
  slot: string | null;
  style: unknown;
  mediaUrl: string | null;
  sponsorName: string | null;
  sponsorLogoUrl: string | null;
  sponsorDescription?: string | null;
  sponsorWebsite?: string | null;
  sponsorTier?: string | null;
  sponsorBrandColors?: Record<string, string> | null;
};

export type StageSchool = {
  schoolId: string;
  turnOrder: number;
  name: string;
  abbreviation: string | null;
  logoUrl: string | null;
};

export type StageProps = {
  competitionName: string;
  competitionLogoUrl?: string | null;
  venue?: string | null;
  edition?: string | null;
  round?: string | null;
  matchNumber?: number | null;
  startsAt?: string | null;
  rules?: string | null;
  schools: StageSchool[];
  sponsors?: StageSponsorInfo[];
  segments: StageSegment[];
  defaults?: boolean;
  mode: "pre" | "break" | "overlays";
};

const STAGE_TYPES = new Set([
  "EVENT_BRANDING",
  "TEAM_CARDS",
  "SPONSOR_ROTATION",
  "SPONSOR_SPOTLIGHT",
  "PARTNER_SLIDE",
  "FINAL_ACK",
  "COUNTDOWN",
  "INSTRUCTIONS",
]);

const HEX = /^#[0-9a-fA-F]{3,8}$/;
const safeColor = (c: unknown): string | null =>
  typeof c === "string" && HEX.test(c) ? c : null;

/** Brand gradient background for spotlight/partner slides. */
function sponsorBackdrop(s: StageSponsorInfo | null): CSSProperties {
  const primary = safeColor(s?.brandColors?.primary);
  const secondary = safeColor(s?.brandColors?.secondary);
  if (!primary && !secondary) {
    return {
      background:
        "radial-gradient(circle at 50% 30%, rgba(242,193,78,0.22), transparent 55%), radial-gradient(circle at 70% 80%, rgba(94,162,255,0.18), transparent 60%), var(--backdrop)",
    };
  }
  return {
    background: `linear-gradient(135deg, ${primary ?? "var(--backdrop)"} 0%, ${
      secondary ?? primary ?? "var(--backdrop)"
    } 100%)`,
  };
}

function sponsorAccent(s: StageSponsorInfo | null): string {
  return (
    safeColor(s?.brandColors?.accent) ??
    safeColor(s?.brandColors?.primary) ??
    "var(--accent)"
  );
}

const DEFAULT_PRE: StageSegment[] = [
  { id: "d-brand", type: "EVENT_BRANDING", durationSec: 6 } as StageSegment,
  { id: "d-rules", type: "INSTRUCTIONS", durationSec: 14 } as StageSegment,
  { id: "d-teams", type: "TEAM_CARDS", durationSec: 12 } as StageSegment,
  { id: "d-spon", type: "SPONSOR_ROTATION", durationSec: 8 } as StageSegment,
  { id: "d-count", type: "COUNTDOWN", durationSec: 10 } as StageSegment,
];

const DEFAULT_BREAK: StageSegment[] = [
  { id: "db-brand", type: "EVENT_BRANDING", durationSec: 6 } as StageSegment,
  { id: "db-rules", type: "INSTRUCTIONS", durationSec: 12 } as StageSegment,
  { id: "db-teams", type: "TEAM_CARDS", durationSec: 10 } as StageSegment,
  { id: "db-spon", type: "SPONSOR_ROTATION", durationSec: 8 } as StageSegment,
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function useClock(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [enabled]);
  return now;
}

export default function ShowStage(props: StageProps) {
  const {
    competitionName,
    competitionLogoUrl,
    venue,
    edition,
    round,
    matchNumber,
    startsAt,
    rules,
    schools,
    sponsors = [],
    segments,
    defaults = false,
    mode,
  } = props;

  const wantPlacement = mode === "break" ? "BREAK" : "PRE_GAME";

  // segments for the current placement; fall back to built-in defaults
  const rotation = useMemo(() => {
    const list = segments.filter(
      (s) => s.placement === wantPlacement && STAGE_TYPES.has(s.type)
    );
    if (list.length > 0) return list;
    if (!defaults) return [];
    return mode === "break" ? DEFAULT_BREAK : DEFAULT_PRE;
  }, [segments, wantPlacement, defaults, mode]);

  // overlay segments (ticker + border) stay up while their rotation runs
  const overlays = useMemo(
    () => ({
      ticker: segments.some((s) => s.type === "TICKER" && s.placement === wantPlacement),
      border: segments.some(
        (s) => s.type === "BORDER_FX" && (s.placement === wantPlacement || s.placement === "IN_GAME")
      ),
    }),
    [segments, wantPlacement]
  );

  // sponsor cards for THIS placement's rotation: explicit segment sponsors
  // first, then the global list. Segments from other placements never leak
  // into a break/pre-game rotation.
  const sponsorLogos = useMemo<StageSponsorInfo[]>(() => {
    const fromSegments = segments
      .filter(
        (s) =>
          s.placement === wantPlacement &&
          (s.type === "SPONSOR_ROTATION" ||
            s.type === "SPONSOR_SPOTLIGHT" ||
            s.type === "PARTNER_SLIDE") &&
          (s.sponsorLogoUrl || s.sponsorName)
      )
      .map((s) => ({
        brandName: s.sponsorName ?? "",
        logoUrl: s.sponsorLogoUrl,
        description: s.sponsorDescription ?? null,
        website: s.sponsorWebsite ?? null,
        tier: s.sponsorTier ?? null,
        brandColors: s.sponsorBrandColors ?? null,
      }));
    const list =
      fromSegments.length > 0
        ? fromSegments
        : sponsors.filter((s) => s.logoUrl || s.description);
    return list;
  }, [segments, sponsors, wantPlacement]);

  // Persistent partner bug: a sponsor from ANY placement can carry the
  // corner logo, plus the global sponsor list.
  const allSponsorLogos = useMemo<StageSponsorInfo[]>(() => {
    const fromSegments = segments
      .filter((s) => s.sponsorLogoUrl && s.sponsorName)
      .map((s) => ({
        brandName: s.sponsorName ?? "",
        logoUrl: s.sponsorLogoUrl,
        description: s.sponsorDescription ?? null,
        website: s.sponsorWebsite ?? null,
        tier: s.sponsorTier ?? null,
        brandColors: s.sponsorBrandColors ?? null,
      }));
    const seen = new Set(fromSegments.map((s) => s.brandName));
    return [
      ...fromSegments,
      ...sponsors.filter((s) => s.logoUrl && !seen.has(s.brandName)),
    ];
  }, [segments, sponsors]);

  // ── rotation engine ──
  const [cycle, setCycle] = useState(0);
  const rotationRef = useRef(rotation);
  rotationRef.current = rotation;

  useEffect(() => {
    if (mode === "overlays") return;
    const current = rotationRef.current[cycle % Math.max(1, rotationRef.current.length)];
    const wait = (current?.durationSec ?? 8) * 1000;
    const t = setTimeout(() => setCycle((c) => c + 1), wait);
    return () => clearTimeout(t);
    // `rotation` must be a dependency: a changed segment carries a new duration
  }, [cycle, mode, rotation]);

  useEffect(() => {
    setCycle(0);
  }, [mode]);

  if (rotation.length === 0 && mode !== "overlays") return null;
  const active = rotation[cycle % Math.max(1, rotation.length)];
  const activeType = mode === "overlays" ? null : active?.type ?? null;
  const sponsorIdx = cycle % Math.max(1, sponsorLogos.length || 1);

  // sponsor used by spotlight / partner slides: the segment's own sponsor,
  // falling back to the rotation index
  const activeSponsor: StageSponsorInfo | null = active?.sponsorName
    ? {
        brandName: active.sponsorName,
        logoUrl: active.sponsorLogoUrl,
        description: active.sponsorDescription ?? null,
        website: active.sponsorWebsite ?? null,
        tier: active.sponsorTier ?? null,
        brandColors: active.sponsorBrandColors ?? null,
      }
    : (sponsorLogos[sponsorIdx] ?? sponsors[sponsorIdx] ?? null);

  const logoSponsors = sponsorLogos.filter((s) => s.logoUrl);
  const bugSponsor =
    allSponsorLogos.length > 0
      ? allSponsorLogos[sponsorIdx % allSponsorLogos.length]
      : null;

  return (
    <div className="stage-root">
      {/* animated backdrop (pre/break only) */}
      {mode !== "overlays" && (
        <>
          <div className="stage-backdrop" />
          <div
            className="stage-orb"
            style={{ width: "34vw", height: "34vw", left: "8%", top: "12%", background: "var(--accent-2)" }}
          />
          <div
            className="stage-orb"
            style={{ width: "26vw", height: "26vw", right: "10%", bottom: "14%", background: "var(--accent)", animationDelay: "-7s" }}
          />
        </>
      )}

      {/* active segment */}
      {activeType === "EVENT_BRANDING" && (
        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
          {competitionLogoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={competitionLogoUrl}
              alt=""
              className="stage-fade-up max-h-[22vh] w-auto max-w-[40vw] rounded-2xl object-contain shadow-2xl"
            />
          )}
          <h1
            className="stage-fade-up stage-shine relative overflow-hidden font-black tracking-tight text-transparent"
            style={{
              backgroundImage: "linear-gradient(100deg, var(--foreground), var(--accent), var(--foreground))",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              fontSize: "clamp(2rem, 7vw, 6.5rem)",
              animationDelay: "0.15s",
            }}
          >
            {competitionName}
          </h1>
          {(edition || venue) && (
            <p className="stage-fade-up font-semibold text-muted" style={{ fontSize: "clamp(1rem, 2.4vw, 1.8rem)", animationDelay: "0.3s" }}>
              {[edition, venue].filter(Boolean).join("  ·  ")}
            </p>
          )}
          {round && (
            <div className="stage-fade-up flex items-center gap-3" style={{ animationDelay: "0.45s" }}>
              <span className="rounded-full bg-accent px-6 py-2 font-black text-black" style={{ fontSize: "clamp(0.9rem, 2vw, 1.4rem)" }}>
                {round}
                {matchNumber ? ` — Match ${matchNumber}` : ""}
              </span>
            </div>
          )}
        </div>
      )}

      {activeType === "TEAM_CARDS" && (
        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-[4vh] px-6">
          <h2 className="stage-fade-up font-black tracking-tight" style={{ fontSize: "clamp(1.4rem, 4vw, 3.2rem)" }}>
            {mode === "break" ? "The Teams" : "Meet the Contenders"}
          </h2>
          <div className="flex w-full max-w-[86vw] flex-wrap items-stretch justify-center gap-[3vw]">
            {schools.map((s, i) => (
              <div
                key={s.schoolId}
                className="stage-card panel flex w-56 flex-col items-center gap-3 border-2 border-line px-4 py-6 shadow-xl"
                style={{ animationDelay: `${i * 0.28}s`, borderColor: "var(--line)" }}
              >
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-accent bg-panel-2 text-2xl font-black text-accent">
                  {s.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.logoUrl} alt="" className="h-full w-full object-contain p-1" />
                  ) : (
                    initials(s.name)
                  )}
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold leading-tight">{s.name}</div>
                  {s.abbreviation && <div className="text-sm font-semibold text-muted">{s.abbreviation}</div>}
                </div>
                <span className="chip chip-ready">Turn {s.turnOrder + 1}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeType === "SPONSOR_ROTATION" && (
        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-6">
          {logoSponsors.length === 0 ? (
            <p className="stage-fade-up text-2xl font-bold text-muted">Powered by our partners</p>
          ) : (
            logoSponsors.map((s, i) =>
              i === sponsorIdx % logoSponsors.length ? (
                <div key={s.brandName} className="stage-pop flex flex-col items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.logoUrl!} alt={s.brandName} className="max-h-[26vh] w-auto max-w-[46vw] object-contain" />
                  <p className="text-lg font-bold uppercase tracking-[0.3em] text-muted">{s.brandName}</p>
                </div>
              ) : null
            )
          )}
        </div>
      )}

      {activeType === "SPONSOR_SPOTLIGHT" && activeSponsor && (
        <>
          <div className="absolute inset-0" style={sponsorBackdrop(activeSponsor)} />
          <div className="relative z-10 flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
            <p
              className="stage-fade-up font-bold uppercase"
              style={{ color: "rgba(255,255,255,0.85)", letterSpacing: "0.55em", fontSize: "clamp(0.8rem, 1.8vw, 1.4rem)" }}
            >
              Presented by
            </p>
            {activeSponsor.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeSponsor.logoUrl}
                alt={activeSponsor.brandName}
                className="stage-pop max-h-[28vh] w-auto max-w-[44vw] rounded-2xl bg-white/95 object-contain p-4 shadow-2xl"
              />
            )}
            <h2
              className="stage-fade-up font-black tracking-tight text-white drop-shadow-lg"
              style={{ fontSize: "clamp(1.8rem, 6vw, 5rem)", animationDelay: "0.15s" }}
            >
              {activeSponsor.brandName}
            </h2>
            {activeSponsor.tier && (
              <span
                className="stage-fade-up rounded-full px-5 py-1.5 font-black uppercase tracking-widest text-black"
                style={{ background: sponsorAccent(activeSponsor), fontSize: "clamp(0.75rem, 1.6vw, 1.2rem)", animationDelay: "0.3s" }}
              >
                {activeSponsor.tier}
              </span>
            )}
            {activeSponsor.description && (
              <p
                className="stage-fade-up mx-auto max-w-3xl text-white/90"
                style={{ fontSize: "clamp(0.95rem, 2vw, 1.6rem)", animationDelay: "0.4s" }}
              >
                {activeSponsor.description}
              </p>
            )}
          </div>
        </>
      )}

      {activeType === "PARTNER_SLIDE" && activeSponsor && (
        <div className="relative z-10 flex h-full items-center justify-center px-6">
          <div
            className="stage-card panel flex w-full max-w-4xl flex-col items-center gap-5 border-2 p-8 text-center sm:p-12"
            style={{ borderColor: sponsorAccent(activeSponsor), background: "rgba(19, 35, 78, 0.9)", backdropFilter: "blur(6px)" }}
          >
            {activeSponsor.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeSponsor.logoUrl}
                alt={activeSponsor.brandName}
                className="stage-fade-up max-h-[18vh] w-auto max-w-[36vw] rounded-xl bg-white/95 object-contain p-3"
              />
            )}
            <div
              className="stage-fade-up font-black tracking-tight"
              style={{ fontSize: "clamp(1.5rem, 4.6vw, 3.6rem)", animationDelay: "0.15s" }}
            >
              {activeSponsor.brandName}
            </div>
            {(activeSponsor.tier || activeSponsor.website) && (
              <div
                className="stage-fade-up flex flex-wrap items-center justify-center gap-3 text-muted"
                style={{ animationDelay: "0.25s" }}
              >
                {activeSponsor.tier && (
                  <span
                    className="rounded-full px-4 py-1 text-sm font-black uppercase tracking-widest text-black"
                    style={{ background: sponsorAccent(activeSponsor) }}
                  >
                    {activeSponsor.tier}
                  </span>
                )}
                {activeSponsor.website && (
                  <span style={{ fontSize: "clamp(0.8rem, 1.6vw, 1.15rem)" }}>{activeSponsor.website}</span>
                )}
              </div>
            )}
            {activeSponsor.description && (
              <p
                className="stage-fade-up leading-relaxed text-foreground/90"
                style={{ fontSize: "clamp(0.95rem, 2vw, 1.5rem)", animationDelay: "0.35s" }}
              >
                {activeSponsor.description}
              </p>
            )}
          </div>
        </div>
      )}

      {activeType === "FINAL_ACK" && (
        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-[4vh] px-6">
          <h2
            className="stage-fade-up font-black tracking-tight"
            style={{ fontSize: "clamp(1.5rem, 4.5vw, 3.6rem)" }}
          >
            Thank you to our partners
          </h2>
          {sponsors.length === 0 ? (
            <p className="text-xl font-bold text-muted">Powered by our partners</p>
          ) : (
            <div className="flex w-full max-w-[88vw] flex-wrap items-center justify-center gap-[2.5vw]">
              {sponsors.map((s, i) => (
                <div
                  key={`${s.brandName}-${i}`}
                  className="stage-card flex flex-col items-center gap-2"
                  style={{ animationDelay: `${i * 0.14}s` }}
                >
                  {s.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.logoUrl}
                      alt={s.brandName}
                      className="max-h-[12vh] w-auto max-w-[16vw] rounded-lg bg-white/95 object-contain p-2"
                    />
                  ) : (
                    <span className="text-2xl font-black" style={{ color: sponsorAccent(s) }}>
                      {s.brandName}
                    </span>
                  )}
                  <span className="text-sm font-bold uppercase tracking-widest text-muted">{s.brandName}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeType === "COUNTDOWN" && <StageCountdown startsAt={startsAt ?? null} />}

      {activeType === "INSTRUCTIONS" && (
        <div className="relative z-10 flex h-full flex-col items-center justify-center px-6">
          <div
            className="stage-card panel w-full max-w-3xl border-2 border-accent/40 p-6 sm:p-10"
            style={{ background: "rgba(19, 35, 78, 0.88)", backdropFilter: "blur(6px)" }}
          >
            <div className="mb-3 flex items-center justify-center gap-3">
              <span style={{ fontSize: "clamp(1.4rem, 3vw, 2.2rem)" }}>📋</span>
              <h2
                className="font-black tracking-widest text-accent uppercase"
                style={{ fontSize: "clamp(1.1rem, 2.6vw, 2rem)" }}
              >
                How it works
              </h2>
            </div>
            <div
              className="stage-fade-up whitespace-pre-wrap text-center leading-relaxed text-foreground/95"
              style={{
                fontSize: "clamp(0.95rem, 2.1vw, 1.5rem)",
                animationDelay: "0.2s",
                maxHeight: "52vh",
                overflowY: "auto",
              }}
            >
              {rules?.trim() ||
                "Each school takes turns picking a question and answering it.\nCorrect answers score the points on the board.\nListen to the Game Master — and may the best school win!"}
            </div>
          </div>
        </div>
      )}

      {/* persistent overlays */}
      {bugSponsor && (
        <div className="stage-pop absolute right-6 top-6 z-20 flex items-center gap-2 rounded-xl border border-line bg-panel/80 px-3 py-2 shadow-lg backdrop-blur">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bugSponsor.logoUrl!} alt="" className="h-9 w-9 rounded object-contain" />
          <span className="hidden text-xs font-bold uppercase tracking-wider text-muted sm:block">
            {bugSponsor.brandName}
          </span>
        </div>
      )}

      {(overlays.ticker || defaults) && mode !== "overlays" && (
        <StageTicker
          items={[
            competitionName,
            edition,
            venue,
            round && matchNumber ? `${round} — Match ${matchNumber}` : null,
            ...sponsorLogos.map((s) => s.brandName),
          ].filter((x): x is string => Boolean(x))}
        />
      )}

      {overlays.border && <div className="stage-border" />}
    </div>
  );
}

function StageCountdown({ startsAt }: { startsAt: string | null }) {
  const target = startsAt ? new Date(startsAt).getTime() : null;
  const valid = target !== null && !Number.isNaN(target) && target > Date.now();
  const now = useClock(valid);

  if (!valid) {
    return (
      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-4">
        <span className="live-dot !h-4 !w-4" />
        <p className="stage-fade-up font-black tracking-tight" style={{ fontSize: "clamp(1.6rem, 5vw, 4rem)" }}>
          The show starts soon
        </p>
        <p className="text-lg font-semibold text-muted">Stay tuned — the arena is warming up</p>
      </div>
    );
  }

  const remain = Math.max(0, target - now);
  const h = Math.floor(remain / 3_600_000);
  const m = Math.floor((remain % 3_600_000) / 60_000);
  const s = Math.floor((remain % 60_000) / 1000);
  const parts = [
    { v: h, l: "hrs" },
    { v: m, l: "min" },
    { v: s, l: "sec" },
  ];

  return (
    <div className="relative z-10 flex h-full flex-col items-center justify-center gap-[5vh]">
      <h2 className="stage-fade-up font-black tracking-tight" style={{ fontSize: "clamp(1.4rem, 4vw, 3rem)" }}>
        We begin in
      </h2>
      <div className="flex items-center justify-center gap-[4vw]">
        {parts.map((p, i) => (
          <div key={p.l} className="stage-card flex flex-col items-center" style={{ animationDelay: `${i * 0.15}s` }}>
            <span
              className="stage-count font-black text-accent"
              style={{ fontSize: "clamp(2.6rem, 10vw, 9rem)", textShadow: "0 0 40px rgba(242,193,78,0.35)" }}
            >
              {String(p.v).padStart(2, "0")}
            </span>
            <span className="text-lg font-bold uppercase tracking-[0.35em] text-muted">{p.l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StageTicker({ items }: { items: string[] }) {
  const line = items.length > 0 ? items : ["Inter-Varsity Competition Platform"];
  const doubled = [...line, ...line];
  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 overflow-hidden border-t border-line bg-panel/90 py-3 backdrop-blur">
      <div className="stage-ticker-track">
        {doubled.map((item, i) => (
          <span key={i} className="mx-6 text-base font-bold uppercase tracking-widest text-muted">
            {item}
            <span className="mx-6 text-accent">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}
