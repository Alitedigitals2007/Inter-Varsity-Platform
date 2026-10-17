"use client";

// Show Director — compose the venue's live broadcast show per match:
// ordered animated segments (pre-game / break / in-game), sponsor logos,
// competition + school branding, all uploaded from this device.
// Includes a live preview of exactly what the projector will play.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ShowStage, { type StageSegment } from "@/components/stage/ShowStage";
import { uploadImage } from "@/lib/uploadLogo";

type MatchRow = {
  id: string;
  matchNumber: number;
  competition: { name: string; edition: string | null };
  round: { name: string };
  schools: { school: { name: string; abbreviation: string | null } }[];
};

type SponsorRow = {
  id: string;
  brandName: string;
  logoUrl: string | null;
  website: string | null;
  description: string | null;
  brandColors: { primary?: string; secondary?: string; accent?: string } | null;
  tier: string | null;
  active: boolean;
};

type SchoolRow = {
  id: string;
  name: string;
  abbreviation: string | null;
  logoUrl: string | null;
  turnOrder: number;
};

type SegmentRow = {
  id?: string;
  type: StageSegment["type"] | string;
  placement: "PRE_GAME" | "BREAK" | "IN_GAME";
  durationSec: number;
  enabled: boolean;
  slot: string | null;
  mediaId: string | null;
  sponsorId: string | null;
};

const SEGMENT_TYPES = [
  { value: "EVENT_BRANDING", label: "Event branding (logo + title)" },
  { value: "TEAM_CARDS", label: "School team cards" },
  { value: "SPONSOR_ROTATION", label: "Sponsor logo rotation" },
  { value: "SPONSOR_SPOTLIGHT", label: "Sponsor spotlight (full-screen)" },
  { value: "PARTNER_SLIDE", label: "Partner slide (logo + blurb)" },
  { value: "FINAL_ACK", label: "Final acknowledgment (all partners)" },
  { value: "COUNTDOWN", label: "Countdown clock" },
  { value: "TICKER", label: "Info ticker (overlay)" },
  { value: "BORDER_FX", label: "Animated border (overlay)" },
];

const QUICK_SLIDES: { type: SegmentRow["type"]; label: string; durationSec: number; placement: SegmentRow["placement"] }[] = [
  { type: "SPONSOR_SPOTLIGHT", label: "+ Spotlight", durationSec: 8, placement: "PRE_GAME" },
  { type: "PARTNER_SLIDE", label: "+ Partner slide", durationSec: 10, placement: "PRE_GAME" },
  { type: "SPONSOR_ROTATION", label: "+ Logo rotation", durationSec: 8, placement: "BREAK" },
];

const SLOTS = ["", "corner-bug", "lower-third", "transition", "banner"];

export default function ShowDirectorPage() {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [segments, setSegments] = useState<SegmentRow[]>([]);
  const [sponsors, setSponsors] = useState<SponsorRow[]>([]);
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [competition, setCompetition] = useState<{
    id: string;
    name: string;
    logoUrl: string | null;
    venue: string | null;
    edition: string | null;
    startsAt: string | null;
  } | null>(null);
  const [round, setRound] = useState("");
  const [matchNumber, setMatchNumber] = useState(1);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [newSponsor, setNewSponsor] = useState("");
  const [previewMode, setPreviewMode] = useState<"pre" | "break" | "overlays">("pre");

  const loadMatches = useCallback(async () => {
    const res = await fetch("/api/admin/matches", { cache: "no-store" });
    const json = await res.json();
    if (json.ok) setMatches(json.data.matches as MatchRow[]);
  }, []);

  const loadShow = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/matches/${id}/show`, { cache: "no-store" });
    const json = await res.json();
    if (!json.ok) return;
    setSegments(
      (json.data.segments as (SegmentRow & { style?: unknown })[]).map((s) => ({
        id: s.id,
        type: s.type,
        placement: s.placement,
        durationSec: s.durationSec,
        enabled: s.enabled,
        slot: s.slot,
        mediaId: s.mediaId,
        sponsorId: s.sponsorId,
      }))
    );
    setSponsors(json.data.sponsors as SponsorRow[]);
    setSchools(json.data.schools as SchoolRow[]);
    setCompetition({
      ...json.data.match.competition,
      startsAt: json.data.match.competition.startsAt ?? null,
    });
    setRound(json.data.match.round.name);
    setMatchNumber(json.data.match.matchNumber);
  }, []);

  useEffect(() => {
    void loadMatches();
  }, [loadMatches]);

  useEffect(() => {
    if (matchId) void loadShow(matchId);
  }, [matchId, loadShow]);

  const flash = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(""), 2500);
  };

  const save = async () => {
    if (!matchId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/matches/${matchId}/show`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ segments }),
      });
      const json = await res.json();
      flash(json.ok ? "Show saved ✓" : json.error?.message ?? "Save failed");
      if (json.ok) await loadShow(matchId);
    } finally {
      setBusy(false);
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    setSegments((list) => {
      const next = [...list];
      const j = index + dir;
      if (j < 0 || j >= next.length) return list;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  const addSegment = () => {
    setSegments((list) => [
      ...list,
      {
        type: "EVENT_BRANDING",
        placement: "PRE_GAME",
        durationSec: 8,
        enabled: true,
        slot: null,
        mediaId: null,
        sponsorId: null,
      },
    ]);
  };

  const uploadTo = async (
    file: File | undefined,
    done: (mediaId: string) => void
  ) => {
    if (!file) return;
    setBusy(true);
    try {
      const media = await uploadImage(file, file.name);
      done(media.id);
      flash("Image uploaded ✓");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const createSponsor = async () => {
    if (!newSponsor.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/sponsors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brandName: newSponsor.trim() }),
      });
      const json = await res.json();
      if (json.ok) {
        setNewSponsor("");
        if (matchId) await loadShow(matchId);
        flash("Sponsor added ✓");
      } else flash(json.error?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  const patchSponsor = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/sponsors/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json.ok) {
      if (matchId) await loadShow(matchId);
      flash("Sponsor updated ✓");
    } else flash(json.error?.message ?? "Failed");
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Show Director</h1>
        <p className="text-sm text-muted">
          Compose the live broadcast for the venue screen — plays before the match,
          between rounds, and as in-game overlays.
        </p>
      </header>

      {/* match picker */}
      <section className="panel p-4">
        <label className="label" htmlFor="match">Match</label>
        <select
          id="match"
          className="input"
          value={matchId ?? ""}
          onChange={(e) => setMatchId(e.target.value || null)}
        >
          <option value="">Select a match…</option>
          {matches.map((m) => (
            <option key={m.id} value={m.id}>
              {m.competition.name} — {m.round.name} — Match {m.matchNumber}
            </option>
          ))}
        </select>
      </section>

      {!matchId && (
        <p className="text-sm text-muted">Pick a match to compose its show.</p>
      )}

      {matchId && competition && (
        <>
          {/* branding uploads */}
          <section className="panel grid gap-4 p-4 sm:grid-cols-2">
            <div>
              <span className="label">Competition logo</span>
              <div className="flex items-center gap-3">
                {competition.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={competition.logoUrl} alt="" className="h-12 w-12 rounded-lg object-contain" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="input"
                  onChange={(e) =>
                    void uploadTo(e.target.files?.[0], async (mediaId) => {
                      await fetch(`/api/admin/competitions/${competition.id}`, {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ logoMediaId: mediaId }),
                      });
                      await loadShow(matchId);
                    })
                  }
                />
              </div>
            </div>
            <div>
              <span className="label">School logos (turn order)</span>
              <div className="flex flex-col gap-2">
                {schools.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 text-sm">
                    <span className="w-6 text-right font-mono text-muted">{s.turnOrder + 1}.</span>
                    {s.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.logoUrl} alt="" className="h-8 w-8 rounded-full object-contain" />
                    ) : (
                      <span className="h-8 w-8 rounded-full border border-line bg-panel-2" />
                    )}
                    <span className="flex-1 truncate">{s.name}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="w-40 text-xs"
                      onChange={(e) =>
                        void uploadTo(e.target.files?.[0], (mediaId) =>
                          void fetch(`/api/admin/schools/${s.id}`, {
                            method: "PATCH",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ logoMediaId: mediaId }),
                          }).then(() => loadShow(matchId))
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* sponsors — profiles, brand colours, slide shortcuts */}
          <section className="panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="label !mb-0">Sponsors — profiles, brand colours & slides</span>
              <button
                className="btn btn-ghost !text-xs"
                onClick={() =>
                  setSegments((l) => [
                    ...l,
                    {
                      type: "FINAL_ACK",
                      placement: "BREAK",
                      durationSec: 10,
                      enabled: true,
                      slot: null,
                      mediaId: null,
                      sponsorId: null,
                    },
                  ])
                }
              >
                + Final acknowledgment
              </button>
            </div>
            <div className="mb-3 flex gap-2">
              <input
                className="input"
                placeholder="New sponsor brand name"
                value={newSponsor}
                onChange={(e) => setNewSponsor(e.target.value)}
              />
              <button className="btn btn-primary" disabled={busy || !newSponsor.trim()} onClick={() => void createSponsor()}>
                Add
              </button>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {sponsors.map((s) => (
                <SponsorCard
                  key={s.id}
                  sponsor={s}
                  busy={busy}
                  onPatch={(body) => patchSponsor(s.id, body)}
                  onUpload={(file) =>
                    uploadTo(file, (mediaId) => void patchSponsor(s.id, { logoMediaId: mediaId }))
                  }
                  onQuickAdd={(slide) =>
                    setSegments((l) => [
                      ...l,
                      {
                        type: slide.type,
                        placement: slide.placement,
                        durationSec: slide.durationSec,
                        enabled: true,
                        slot: null,
                        mediaId: null,
                        sponsorId: s.id,
                      },
                    ])
                  }
                  onDelete={async () => {
                    if (!confirm(`Delete sponsor “${s.brandName}”?`)) return;
                    await fetch(`/api/admin/sponsors/${s.id}`, { method: "DELETE" });
                    if (matchId) await loadShow(matchId);
                    flash("Sponsor deleted");
                  }}
                />
              ))}
              {sponsors.length === 0 && (
                <p className="text-sm text-muted">No sponsors yet — add one above, then upload its logo.</p>
              )}
            </div>
          </section>

          {/* segment timeline */}
          <section className="panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="label !mb-0">Segment timeline (order = play order)</span>
              <button className="btn btn-ghost" onClick={addSegment}>+ Add segment</button>
            </div>
            <div className="flex flex-col gap-2">
              {segments.map((seg, i) => (
                <div key={seg.id ?? `new-${i}`} className="grid grid-cols-1 gap-2 rounded-lg border border-line bg-panel-2 p-3 sm:grid-cols-[1fr_auto]">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <select
                      className="input !py-1.5 text-sm"
                      value={seg.type}
                      onChange={(e) =>
                        setSegments((l) => l.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))
                      }
                    >
                      {SEGMENT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    <select
                      className="input !py-1.5 text-sm"
                      value={seg.placement}
                      onChange={(e) =>
                        setSegments((l) =>
                          l.map((x, j) =>
                            j === i ? { ...x, placement: e.target.value as SegmentRow["placement"] } : x
                          )
                        )
                      }
                    >
                      <option value="PRE_GAME">Pre-game</option>
                      <option value="BREAK">Break</option>
                      <option value="IN_GAME">In-game</option>
                    </select>
                    <input
                      type="number"
                      min={2}
                      max={300}
                      className="input !py-1.5 text-sm"
                      value={seg.durationSec}
                      onChange={(e) =>
                        setSegments((l) =>
                          l.map((x, j) => (j === i ? { ...x, durationSec: Number(e.target.value) } : x))
                        )
                      }
                      title="Duration (seconds)"
                    />
                    <select
                      className="input !py-1.5 text-sm"
                      value={seg.slot ?? ""}
                      onChange={(e) =>
                        setSegments((l) => l.map((x, j) => (j === i ? { ...x, slot: e.target.value || null } : x)))
                      }
                    >
                      {SLOTS.map((s) => (
                        <option key={s} value={s}>{s || "no slot"}</option>
                      ))}
                    </select>
                    <select
                      className="input !py-1.5 text-sm"
                      value={seg.sponsorId ?? ""}
                      onChange={(e) =>
                        setSegments((l) => l.map((x, j) => (j === i ? { ...x, sponsorId: e.target.value || null } : x)))
                      }
                    >
                      <option value="">no sponsor</option>
                      {sponsors.filter((s) => s.active).map((s) => (
                        <option key={s.id} value={s.id}>{s.brandName}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <button className="btn btn-ghost !px-2" title="Up" onClick={() => move(i, -1)}>↑</button>
                    <button className="btn btn-ghost !px-2" title="Down" onClick={() => move(i, 1)}>↓</button>
                    <label className="flex items-center gap-1 px-1 text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={seg.enabled}
                        onChange={(e) =>
                          setSegments((l) => l.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))
                        }
                      />
                      on
                    </label>
                    <button
                      className="btn btn-bad !px-2"
                      title="Delete"
                      onClick={() => setSegments((l) => l.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              {segments.length === 0 && (
                <p className="text-sm text-muted">
                  No segments — the screen plays the built-in default show. Add segments to customize.
                </p>
              )}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
                Save show
              </button>
              {status && <span className="text-sm font-semibold text-good">{status}</span>}
            </div>
          </section>

          {/* preview */}
          <section className="panel p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="label !mb-0">Live preview</span>
                {(["pre", "break", "overlays"] as const).map((m) => (
                  <button
                    key={m}
                    className={`btn !py-1 !text-xs ${previewMode === m ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setPreviewMode(m)}
                  >
                    {m === "pre" ? "Pre-game" : m === "break" ? "Break" : "In-game overlays"}
                  </button>
                ))}
              </div>
              <Link
                href={`/show/${matchId}`}
                target="_blank"
                className="btn btn-ghost !text-xs"
                title="Public link you can share with sponsors"
              >
                Sponsor preview link ↗
              </Link>
            </div>
            <StagePreview
              competition={competition}
              round={round}
              matchNumber={matchNumber}
              schools={schools}
              sponsors={sponsors}
              segments={segments}
              mode={previewMode}
            />
          </section>
        </>
      )}
    </div>
  );
}

function SponsorCard({
  sponsor,
  busy,
  onPatch,
  onUpload,
  onQuickAdd,
  onDelete,
}: {
  sponsor: SponsorRow;
  busy: boolean;
  onPatch: (body: Record<string, unknown>) => Promise<void>;
  onUpload: (file: File | undefined) => Promise<void>;
  onQuickAdd: (slide: (typeof QUICK_SLIDES)[number]) => void;
  onDelete: () => Promise<void>;
}) {
  const [brandName, setBrandName] = useState(sponsor.brandName);
  const [description, setDescription] = useState(sponsor.description ?? "");
  const [website, setWebsite] = useState(sponsor.website ?? "");
  const [tier, setTier] = useState(sponsor.tier ?? "");
  const [primary, setPrimary] = useState(sponsor.brandColors?.primary ?? "");
  const [secondary, setSecondary] = useState(sponsor.brandColors?.secondary ?? "");
  const [accent, setAccent] = useState(sponsor.brandColors?.accent ?? "");

  useEffect(() => {
    setBrandName(sponsor.brandName);
    setDescription(sponsor.description ?? "");
    setWebsite(sponsor.website ?? "");
    setTier(sponsor.tier ?? "");
    setPrimary(sponsor.brandColors?.primary ?? "");
    setSecondary(sponsor.brandColors?.secondary ?? "");
    setAccent(sponsor.brandColors?.accent ?? "");
  }, [sponsor]);

  const saveColors = (next: { primary: string; secondary: string; accent: string }) =>
    void onPatch({
      brandColors: {
        ...(next.primary ? { primary: next.primary } : {}),
        ...(next.secondary ? { secondary: next.secondary } : {}),
        ...(next.accent ? { accent: next.accent } : {}),
      },
    });

  return (
    <div className="rounded-xl border border-line bg-panel-2 p-3">
      <div className="flex items-center gap-3">
        {sponsor.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sponsor.logoUrl} alt="" className="h-10 w-10 rounded object-contain" />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded bg-line text-[10px] font-black text-muted">
            LOGO
          </span>
        )}
        <input
          className="input !py-1 font-semibold"
          value={brandName}
          onChange={(e) => setBrandName(e.target.value)}
          onBlur={() => brandName.trim() && brandName !== sponsor.brandName && void onPatch({ brandName: brandName.trim() })}
        />
        <label className="flex shrink-0 items-center gap-1 text-xs text-muted">
          <input
            type="checkbox"
            checked={sponsor.active}
            onChange={(e) => void onPatch({ active: e.target.checked })}
          />
          active
        </label>
        <button
          className="btn btn-bad !px-2 !py-1 !text-xs"
          disabled={busy}
          onClick={() => void onDelete()}
          title="Delete sponsor"
        >
          ✕
        </button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          type="file"
          accept="image/*"
          className="input !py-1 text-xs"
          onChange={(e) => void onUpload(e.target.files?.[0])}
        />
        <input
          className="input !py-1 text-xs"
          placeholder="Tier (e.g. Gold)"
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          onBlur={() => tier !== (sponsor.tier ?? "") && void onPatch({ tier: tier.trim() || null })}
        />
      </div>
      <input
        className="input mt-2 !py-1 text-xs"
        placeholder="Website (shown on partner slides)"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        onBlur={() => website !== (sponsor.website ?? "") && void onPatch({ website: website.trim() || null })}
      />
      <textarea
        className="input mt-2 !py-1 text-xs"
        rows={2}
        placeholder="Short blurb about the sponsor (shown on partner slides)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => description !== (sponsor.description ?? "") && void onPatch({ description: description.trim() || null })}
      />

      {/* brand colours */}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {[
          { label: "Primary", value: primary, set: setPrimary, key: "primary" },
          { label: "Secondary", value: secondary, set: setSecondary, key: "secondary" },
          { label: "Accent", value: accent, set: setAccent, key: "accent" },
        ].map((c) => (
          <label key={c.key} className="flex items-center gap-1.5 text-[11px] font-bold text-muted uppercase">
            <input
              type="color"
              className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent"
              value={c.value || "#5ea2ff"}
              onChange={(e) => {
                c.set(e.target.value);
                saveColors({
                  primary: c.key === "primary" ? e.target.value : primary,
                  secondary: c.key === "secondary" ? e.target.value : secondary,
                  accent: c.key === "accent" ? e.target.value : accent,
                });
              }}
            />
            {c.label}
            {c.value && (
              <button
                className="text-muted hover:text-bad"
                title="Clear colour"
                onClick={() => {
                  c.set("");
                  const next = { primary, secondary, accent };
                  if (c.key === "primary") next.primary = "";
                  if (c.key === "secondary") next.secondary = "";
                  if (c.key === "accent") next.accent = "";
                  saveColors(next);
                }}
              >
                ✕
              </button>
            )}
          </label>
        ))}
      </div>

      {/* quick slide shortcuts */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK_SLIDES.map((s) => (
          <button
            key={s.type}
            className="btn btn-ghost !px-2 !py-1 !text-xs"
            title={`Adds a ${s.durationSec}s ${s.placement.replace("_", "-").toLowerCase()} segment for ${sponsor.brandName}`}
            onClick={() => onQuickAdd(s)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StagePreview({
  competition,
  round,
  matchNumber,
  schools,
  sponsors,
  segments,
  mode,
}: {
  competition: { name: string; logoUrl: string | null; venue: string | null; edition: string | null; startsAt: string | null };
  round: string;
  matchNumber: number;
  schools: SchoolRow[];
  sponsors: SponsorRow[];
  segments: SegmentRow[];
  mode: "pre" | "break" | "overlays";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);

  useEffect(() => {
    const measure = () => {
      const w = ref.current?.clientWidth;
      const vw = window.innerWidth;
      if (w && vw) setScale(Math.min(1, w / vw));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // render at true viewport size, scaled down — identical to the projector
  return (
    <div ref={ref} className="relative w-full overflow-hidden rounded-xl border border-line" style={{ aspectRatio: "16 / 9" }}>
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: "100vw", height: "56.25vw", transform: `scale(${scale})` }}
      >
        <ShowStage
          mode={mode}
          competitionName={competition.name}
          competitionLogoUrl={competition.logoUrl}
          venue={competition.venue}
          edition={competition.edition}
          startsAt={competition.startsAt}
          round={round}
          matchNumber={matchNumber}
          schools={schools.map((s) => ({ ...s, schoolId: s.id }))}
          sponsors={sponsors.map((s) => ({
            brandName: s.brandName,
            logoUrl: s.logoUrl,
            website: s.website,
            description: s.description,
            brandColors: s.brandColors,
            tier: s.tier,
          }))}
          segments={segments.map((s) => ({
            ...s,
            id: s.id ?? "preview",
            style: null,
            mediaUrl: s.mediaId ? `/api/media/${s.mediaId}` : null,
            sponsorName: sponsors.find((x) => x.id === s.sponsorId)?.brandName ?? null,
            sponsorLogoUrl: sponsors.find((x) => x.id === s.sponsorId)?.logoUrl ?? null,
            sponsorDescription: sponsors.find((x) => x.id === s.sponsorId)?.description ?? null,
            sponsorWebsite: sponsors.find((x) => x.id === s.sponsorId)?.website ?? null,
            sponsorTier: sponsors.find((x) => x.id === s.sponsorId)?.tier ?? null,
            sponsorBrandColors: sponsors.find((x) => x.id === s.sponsorId)?.brandColors ?? null,
          }))}
          defaults={segments.length === 0}
        />
      </div>
    </div>
  );
}
