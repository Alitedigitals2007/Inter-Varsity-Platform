"use client";

// Audit logs (spec §2.1 / §16): every sensitive action, filterable.

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/client";

type Log = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorLabel: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
  user: { loginId: string; name: string } | null;
};

export default function AuditPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [total, setTotal] = useState(0);
  const [entityType, setEntityType] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const d = await apiGet<{ logs: Log[]; total: number }>(
      `/api/admin/audit?take=200${entityType ? `&entityType=${entityType}` : ""}`
    );
    setLogs(d.logs);
    setTotal(d.total);
    setLoaded(true);
  }, [entityType]);

  useEffect(() => {
    load().catch(() => setLoaded(true));
  }, [load]);

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Audit Logs</h1>
          <p className="text-muted">{total} records · showing latest {logs.length}</p>
        </div>
        <select className="input !w-48" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          <option value="">All entity types</option>
          <option value="Match">Match</option>
          <option value="Answer">Answer</option>
          <option value="MatchSchool">MatchSchool (scores)</option>
          <option value="School">School</option>
          <option value="Competition">Competition</option>
          <option value="Question">Question</option>
          <option value="SchoolAccessCode">Access codes</option>
          <option value="User">Users</option>
        </select>
      </div>

      {!loaded ? (
        <div className="text-muted">Loading…</div>
      ) : logs.length === 0 ? (
        <div className="panel px-4 py-8 text-center text-muted">No audit records.</div>
      ) : (
        <div className="panel divide-y divide-line">
          {logs.map((l) => (
            <div key={l.id} className="px-4 py-2.5">
              <button className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 text-left" onClick={() => setExpanded(expanded === l.id ? null : l.id)}>
                <span className="min-w-0">
                  <span className="font-mono text-xs font-bold">{l.action}</span>
                  <span className="ml-2 text-xs text-muted">
                    {l.entityType}
                    {l.reason ? ` · ${l.reason}` : ""}
                  </span>
                </span>
                <span className="min-w-0 text-xs text-muted">
                  {l.actorLabel ?? l.user?.loginId ?? "system"} · {new Date(l.createdAt).toLocaleString()}
                </span>
              </button>
              {expanded === l.id && (
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-panel-2 p-2 text-[11px] text-muted">
                  {JSON.stringify({ before: l.before, after: l.after }, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
