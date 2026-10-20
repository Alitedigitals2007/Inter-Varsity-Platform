"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend, ClientApiError } from "@/lib/client";

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await apiSend<{ role: string }>(
        "/api/auth/login",
        "POST",
        { loginId, password }
      );
      router.push(data.role === "ADMIN" ? "/admin" : "/gm");
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <form onSubmit={submit} className="panel w-full max-w-sm p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/fassa.png" alt="FASSA crest" className="mx-auto mb-4 h-24 w-24 rounded-full object-contain" />
        <h1 className="text-center text-2xl font-bold">Staff Sign In</h1>
        <p className="mb-6 mt-1 text-center text-sm text-muted">
          FASSA Inter-Varsity · Admin and Game Master accounts
        </p>

        <label className="label" htmlFor="loginId">Login ID</label>
        <input
          id="loginId"
          className="input mb-4"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          autoComplete="username"
          required
        />

        <label className="label" htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          className="input mb-5"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        {error && (
          <div className="mb-4 rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
            {error}
          </div>
        )}

        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign In"}
        </button>

        <div className="mt-6 border-t border-line pt-4 text-xs text-muted">
          <div className="mb-2 font-bold tracking-widest uppercase">Who signs in here?</div>
          <ul className="space-y-1.5">
            <li>
              <span className="font-semibold text-foreground">Admin</span> — set up competitions, schools,
              questions, access codes, and user accounts.
            </li>
            <li>
              <span className="font-semibold text-foreground">Game Master</span> — run the live match:
              start, reveal, time, and judge.
            </li>
          </ul>
          <div className="mt-3">
            Schools join with an access code at{" "}
            <a href="/join" className="font-semibold text-accent">/join</a>, and the venue display lives
            at <a href="/screen" className="font-semibold text-accent">/screen</a>.
          </div>
        </div>
      </form>
    </div>
  );
}
