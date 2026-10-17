"use client";

// School joining flow (spec §12.3): enter school access code (+ optional
// display name), the server validates scope and creates/reuses the session,
// then the device lands on the school match screen.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend, ClientApiError } from "@/lib/client";
import RoleGuide from "@/components/RoleGuide";

type JoinResult = {
  matchId: string;
  schoolName: string;
  rejoined: boolean;
  needsMatchSelection?: boolean;
  matches?: { id: string; matchNumber: number; roundName: string; status: string }[];
};

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<JoinResult | null>(null);

  async function join(matchId?: string) {
    setBusy(true);
    setError(null);
    try {
      const data = await apiSend<JoinResult>("/api/join", "POST", {
        code: code.trim().toUpperCase(),
        displayName: displayName.trim() || undefined,
        matchId,
      });
      if (data.needsMatchSelection) {
        setChoices(data);
        return;
      }
      sessionStorage.setItem("fassa_match", data.matchId);
      router.push("/play");
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Could not join");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <div className="w-full max-w-sm">
        <RoleGuide role="SCHOOL" />
      </div>
      <div className="flex flex-1 items-center justify-center w-full">
      <div className="panel w-full max-w-sm p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/fassa.png" alt="FAASSA crest" className="mx-auto mb-4 h-24 w-24 rounded-full object-contain" />
        <h1 className="text-center text-2xl font-bold">School Access</h1>
        <p className="mb-6 mt-1 text-center text-sm text-muted">
          Enter the access code provided by the organizers.
        </p>

        {!choices ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void join();
            }}
          >
            <label className="label" htmlFor="code">Access Code</label>
            <input
              id="code"
              className="input mb-4 text-center font-mono text-lg tracking-widest uppercase"
              placeholder="XXXX-XXXX"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />

            <label className="label" htmlFor="name">Your Name (optional)</label>
            <input
              id="name"
              className="input mb-5"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
            />

            {error && (
              <div className="mb-4 rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
                {error}
              </div>
            )}

            <button className="btn btn-primary w-full" disabled={busy || code.trim().length < 4}>
              {busy ? "Joining…" : "Join Competition"}
            </button>
          </form>
        ) : (
          <div>
            <div className="mb-3 text-sm text-muted">
              <span className="font-semibold text-foreground">{choices.schoolName}</span> —
              pick your match:
            </div>
            <div className="flex flex-col gap-2">
              {choices.matches?.map((m) => (
                <button
                  key={m.id}
                  className="btn btn-ghost justify-between"
                  onClick={() => void join(m.id)}
                  disabled={busy}
                >
                  <span>
                    {m.roundName} · Match {m.matchNumber}
                  </span>
                  <span className="chip">{m.status}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
