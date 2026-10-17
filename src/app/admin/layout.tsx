"use client";

// Admin shell (spec §3.1): structured navigation + staff gate.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/lib/client";

const NAV = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/competitions", label: "Competitions" },
  { href: "/admin/schools", label: "Schools" },
  { href: "/admin/access-codes", label: "Access Codes" },
  { href: "/admin/questions", label: "Question Bank" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/audit", label: "Audit Logs" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<{ name: string; role: string } | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    apiGet<{ identity: { kind: string; name?: string; role?: string } }>("/api/auth/me")
      .then((d) => {
        if (d.identity?.kind !== "STAFF") {
          router.replace("/login");
          return;
        }
        setMe({ name: d.identity.name ?? "", role: d.identity.role ?? "" });
        setChecked(true);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  if (!checked) return <div className="flex flex-1 items-center justify-center text-muted">Checking access…</div>;

  async function signOut() {
    await apiSend("/api/auth/logout", "POST");
    router.replace("/login");
  }

  return (
    <div className="flex flex-1">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-panel px-3 py-5">
        <Link href="/admin" className="mb-6 flex items-center gap-2 px-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fassa.png" alt="" className="h-9 w-9 rounded-full object-contain" />
          <span className="text-lg font-black tracking-tight">FAASSA Admin</span>
        </Link>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                  active ? "bg-accent/15 text-accent" : "text-muted hover:bg-panel-2 hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-line pt-4">
          <div className="px-2 text-xs text-muted">
            {me?.name}
            <span className="ml-1 rounded bg-panel-2 px-1.5 py-0.5 font-bold">{me?.role}</span>
          </div>
          <div className="mt-2 flex flex-col gap-0.5">
            <Link href="/gm" className="rounded-md px-3 py-1.5 text-xs font-semibold text-muted hover:text-foreground">
              Game Master →
            </Link>
            <button onClick={() => void signOut()} className="rounded-md px-3 py-1.5 text-left text-xs font-semibold text-muted hover:text-bad">
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto px-8 py-8">{children}</main>
    </div>
  );
}
