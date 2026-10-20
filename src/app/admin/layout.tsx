"use client";

// Admin shell (spec §3.1): structured navigation + staff gate.
// Desktop: fixed sidebar. Phone/tablet: top bar + slide-over drawer.

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
  { href: "/admin/show", label: "Sponsor Studio" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/audit", label: "Audit Logs" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<{ name: string; role: string } | null>(null);
  const [checked, setChecked] = useState(false);
  // Drawer visibility is keyed to the route it was opened on, so navigating
  // (even via browser back/forward) closes it without an effect.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menuOpen = menuFor === pathname;

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

  const nav = (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMenuFor(null)}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
              active ? "bg-accent/15 text-accent" : "text-muted hover:bg-panel-2 hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
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
  );

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      {/* phone / tablet top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-panel/95 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/admin" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fassa.png" alt="" className="h-8 w-8 rounded-full object-contain" />
          <span className="text-base font-black tracking-tight">FASSA Admin</span>
        </Link>
        <button
          className="btn btn-ghost ml-auto !px-3"
          aria-label="Open menu"
          onClick={() => setMenuFor(pathname)}
        >
          ☰ Menu
        </button>
      </header>

      {/* drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMenuFor(null)} />
          <aside className="absolute top-0 left-0 flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-line bg-panel px-3 py-5">
            <div className="mb-4 flex items-center justify-between px-2">
              <span className="text-lg font-black tracking-tight">Menu</span>
              <button className="btn btn-ghost !px-3 !py-1" aria-label="Close menu" onClick={() => setMenuFor(null)}>
                ✕
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      )}

      {/* desktop sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-panel px-3 py-5 lg:flex">
        <Link href="/admin" className="mb-6 flex items-center gap-2 px-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fassa.png" alt="" className="h-9 w-9 rounded-full object-contain" />
          <span className="text-lg font-black tracking-tight">FASSA Admin</span>
        </Link>
        {nav}
        {footer}
      </aside>

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
