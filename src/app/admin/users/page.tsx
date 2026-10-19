"use client";

// Users & permissions (spec §2.1): staff accounts for Admin and Game Master.

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend, ClientApiError } from "@/lib/client";

type User = { id: string; loginId: string; name: string; role: string; active: boolean };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ loginId: "", password: "", name: "", role: "GAME_MASTER" });
  const [busy, setBusy] = useState(false);
  // Per-user password reset target, keyed by user id.
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");

  const load = useCallback(async () => {
    const d = await apiGet<{ users: User[] }>("/api/admin/users");
    setUsers(d.users);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiSend("/api/admin/users", "POST", form);
      setForm({ loginId: "", password: "", name: "", role: "GAME_MASTER" });
      setNotice("User created.");
      await load();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Failed to create user");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(u: User) {
    if (!confirm(`${u.active ? "Deactivate" : "Activate"} ${u.loginId}?`)) return;
    setError(null);
    try {
      await apiSend("/api/admin/users", "PATCH", { id: u.id, active: !u.active });
      await load();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Failed");
    }
  }

  async function resetPassword(id: string, loginId: string) {
    if (!resetPw || resetPw.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    setError(null);
    try {
      await apiSend("/api/admin/users", "PATCH", { id, password: resetPw });
      setNotice(`Password updated for ${loginId}.`);
      setResetFor(null);
      setResetPw("");
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Failed to update password");
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-3xl font-bold">Users</h1>
      <p className="mb-6 text-muted">Admin and Game Master accounts.</p>

      {error && <div className="mb-4 rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>}
      {notice && <div className="mb-4 rounded-md border border-good/40 bg-good/10 px-3 py-2 text-sm text-good">{notice}</div>}

      <form onSubmit={create} className="panel mb-6 grid gap-3 p-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="ulogin">Login ID</label>
          <input id="ulogin" className="input" value={form.loginId} onChange={(e) => setForm({ ...form, loginId: e.target.value })} required minLength={3} />
        </div>
        <div>
          <label className="label" htmlFor="uname">Display name</label>
          <input id="uname" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="upass">Password</label>
          <input id="upass" type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
        </div>
        <div>
          <label className="label" htmlFor="urole">Role</label>
          <select id="urole" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="GAME_MASTER">Game Master</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <button className="btn btn-primary" disabled={busy}>Create user</button>
        </div>
      </form>

      <div className="panel divide-y divide-line">
        {users.map((u) => (
          <div key={u.id}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <div className="font-semibold">
                  {u.name}
                  {!u.active && <span className="ml-2 chip chip-draft">INACTIVE</span>}
                </div>
                <div className="text-xs text-muted">
                  {u.loginId} · <span className="font-bold">{u.role}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn btn-ghost !text-xs" onClick={() => void toggle(u)}>
                  {u.active ? "Deactivate" : "Activate"}
                </button>
                <button
                  className="btn btn-ghost !text-xs"
                  onClick={() => {
                    setResetFor(resetFor === u.id ? null : u.id);
                    setResetPw("");
                    setError(null);
                  }}
                >
                  Reset password
                </button>
              </div>
            </div>
            {resetFor === u.id && (
              <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
                <input
                  type="password"
                  className="input min-w-0 flex-1"
                  placeholder={`New password for ${u.loginId} (min 8 chars)`}
                  value={resetPw}
                  onChange={(e) => setResetPw(e.target.value)}
                  minLength={8}
                />
                <button className="btn btn-primary !text-xs" onClick={() => void resetPassword(u.id, u.loginId)}>
                  Save
                </button>
                <button className="btn btn-ghost !text-xs" onClick={() => setResetFor(null)}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
