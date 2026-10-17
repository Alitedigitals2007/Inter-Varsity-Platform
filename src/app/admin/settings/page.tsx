"use client";

// Platform settings: defaults applied when creating matches. Organizers can
// still override every value per match in the Match Wizard.

import { useEffect, useState } from "react";

type Settings = {
  defaultTurnsPerSchool: number;
  defaultQualifyCount: number | null;
  defaultEliminateCount: number | null;
  autoAdvance: boolean;
  autoAdvanceSec: number;
  sound: boolean;
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch("/api/admin/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) setSettings(json.data.settings as Settings);
      })
      .catch(() => {});
  }, []);

  const flash = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(""), 2500);
  };

  const save = async () => {
    if (!settings) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (json.ok) {
        setSettings(json.data.settings as Settings);
        flash("Settings saved");
      } else flash(json.error?.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  };

  if (!settings) {
    return <div className="text-sm text-muted">Loading settings…</div>;
  }

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => (s ? { ...s, [key]: value } : s));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Settings</h1>
        <p className="text-sm text-muted">
          Platform-wide defaults. Every value can be overridden per match in the Match Wizard.
        </p>
      </header>

      <section className="panel flex flex-col gap-4 p-4">
        <h2 className="text-sm font-black tracking-widest text-muted uppercase">Match defaults</h2>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="turns">Turns per school</label>
            <input
              id="turns"
              type="number"
              min={1}
              max={50}
              className="input"
              value={settings.defaultTurnsPerSchool}
              onChange={(e) => set("defaultTurnsPerSchool", Math.max(1, Number(e.target.value)))}
            />
            <p className="mt-1 text-xs text-muted">
              Round auto-completes when every school has played this many turns in each match.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="qualify">Qualify (top N)</label>
            <input
              id="qualify"
              type="number"
              min={0}
              max={64}
              className="input"
              value={settings.defaultQualifyCount ?? ""}
              placeholder="none"
              onChange={(e) =>
                set("defaultQualifyCount", e.target.value === "" ? null : Math.max(0, Number(e.target.value)))
              }
            />
            <p className="mt-1 text-xs text-muted">Applied automatically when a match ends.</p>
          </div>
          <div>
            <label className="label" htmlFor="eliminate">Eliminate (bottom N)</label>
            <input
              id="eliminate"
              type="number"
              min={0}
              max={64}
              className="input"
              value={settings.defaultEliminateCount ?? ""}
              placeholder="none"
              onChange={(e) =>
                set("defaultEliminateCount", e.target.value === "" ? null : Math.max(0, Number(e.target.value)))
              }
            />
            <p className="mt-1 text-xs text-muted">Ties at the boundary are flagged for staff review.</p>
          </div>
        </div>
      </section>

      <section className="panel flex flex-col gap-4 p-4">
        <h2 className="text-sm font-black tracking-widest text-muted uppercase">Live flow</h2>

        <label className="flex items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={settings.autoAdvance}
            onChange={(e) => set("autoAdvance", e.target.checked)}
          />
          Auto-advance to the next turn after a result is shown
        </label>

        <div>
          <label className="label" htmlFor="advanceSec">Auto-advance delay (seconds)</label>
          <input
            id="advanceSec"
            type="number"
            min={1}
            max={60}
            className="input sm:w-40"
            value={settings.autoAdvanceSec}
            disabled={!settings.autoAdvance}
            onChange={(e) => set("autoAdvanceSec", Math.min(60, Math.max(1, Number(e.target.value))))}
          />
          <p className="mt-1 text-xs text-muted">
            The GM can always advance early or pause via the dashboard.
          </p>
        </div>

        <label className="flex items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={settings.sound}
            onChange={(e) => set("sound", e.target.checked)}
          />
          Play countdown ticks and verdict chimes on devices (clients can still mute)
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
          Save settings
        </button>
        {status && <span className="text-sm font-semibold text-good">{status}</span>}
      </div>
    </div>
  );
}
