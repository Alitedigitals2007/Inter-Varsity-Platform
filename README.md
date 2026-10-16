# Inter-Varsity Competition Platform

Real-time competition management for live, in-person inter-varsity events.
Turn-by-turn gameplay with server-authoritative scoring, timers, and
leaderboards — every screen stays in sync.

Built to the [full product specification](./Inter_Varsity_Competition_Platform_Full_Specification.md).

## Roles & screens

| Role | URL | Purpose |
|---|---|---|
| Admin | `/admin` | Competitions, rounds, matches, schools, access codes, question bank, users, audit logs |
| Game Master | `/gm` | Run the live match: turns, timers, reveals, judging, overrides |
| Main screen | `/screen` | Projector/LED view for the venue |
| School device | `/join` → `/play` | Contestants join with an access code and play their turn |

Staff sign in at `/login`.

## Stack

- **Next.js 16** (App Router, React 19, Tailwind v4)
- **PostgreSQL** via **Prisma 6** (Neon online, local Postgres offline)
- **Ably** push for live updates online, **snapshot polling** fallback
  (offline/LAN mode needs neither a key nor a second process)
- Server-authoritative match engine — browsers never decide official outcomes
- **Live Show Stage** — an admin-composed broadcast package (logos, sponsors,
  countdown, ticker, border FX) that plays on the venue screen before and
  between matches

## Architecture

```
Next.js (API routes)  ──writes──►  PostgreSQL (source of truth)
        │
        └──publish──► Ably (push) ──► all screens reconcile via snapshots
                       (or 2.5 s polling when Ably is not configured)
```

- Every mutation is a **Command** (`src/lib/engine/commands.ts`) executed in a
  DB transaction with `SELECT … FOR UPDATE` on the match row; it emits
  **Events** appended to `match_events` with a monotonic sequence + version.
- Clients (all four screens) hold a **snapshot** (`/api/matches/[id]/snapshot`)
  and refresh it whenever a realtime event carries a newer version — a dropped
  broadcast can never leave a stale screen.
- The timer is a server deadline, not a browser countdown; expiry is enforced
  authoritatively inside snapshot/command reads — no background process.
- Answer keys never leave the server before the authorized reveal.
- Score corrections never overwrite history — they append reversal events;
  every override is audited with actor, reason, before/after.

## Getting started

```bash
cp .env.example .env       # fill in DATABASE_URL (e.g. Neon Postgres)
npm install
npm run db:push            # create schema
npm run db:seed            # demo competition + schools + questions + codes
npm run dev                # http://localhost:3000
```

Seed output prints the demo logins and per-school access codes.

- Admin: `admin` / `fassaui`  (`ADMIN_PASSWORD` overrides this)
- Game Master: `gm` / `gm123456`

## Offline installer (what end users run)

End users never touch npm, a code editor, or the internet. Build the
self-contained installer once on a dev machine, then hand them one file:

```bash
npm run package      # assemble a full offline package
npm run installer    # → Inter-Varsity-Platform-Setup.exe
```

The resulting `.exe` is a single self-extracting archive. Copy it to any
Windows laptop (USB stick, shared folder, download), double-click, and it
extracts, creates Start-menu/desktop shortcuts, and offers to launch. It
bundles a portable Node runtime, so the target machine needs **no** Node,
npm, VS Code, source code, or network access.

The only thing a fresh install supplies is a Postgres `DATABASE_URL`, once,
on first run. See [`SETUP.md`](./SETUP.md) for the full walkthrough,
verification, and uninstall steps.

> **Build outputs go to `Downloads`, not this repo** — the project lives
> inside OneDrive, and shipping ~800 MB through it is slow and error-prone.
> Set `IVP_OUT` to override the destination.

## Scripts

| Command | |
|---|---|
| `npm run dev` | Next.js + realtime service together |
| `npm run dev:next` / `npm run dev:rt` | Individual processes |
| `npm run db:push` | Sync schema to the database |
| `npm run db:seed` | Seed demo data |
| `npm run build` | Production build |
| `npm run package` | Assemble the offline package |
| `npm run verify-package` | Structural checks on the package |
| `npm run smoke-test` | Boot the package and assert HTTP 200s |
| `npm run installer` | Compile the self-extracting `.exe` |

## Environment (`.env`)

| Variable | |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `SESSION_SECRET` | Session token entropy |
| `SESSION_TTL_HOURS` | Session lifetime (default 24) |
| `ABLY_API_KEY` | Optional — enables instant push; polling is the fallback |
| `ADMIN_PASSWORD` | Production admin password for seeding (never ship the default online) |

## Deploying online

Full walkthrough in [`SETUP.md`](./SETUP.md) (Option C): **Vercel** (Next.js) +
**Neon** (Postgres) + **Ably** (optional live push). In short: push to GitHub,
import into Vercel, set `DATABASE_URL` / `SESSION_SECRET` / `ABLY_API_KEY` /
`ADMIN_PASSWORD`, then `prisma db push` + seed against the Neon URL.

## Running a match (quick tour)

1. **Admin → Competitions**: create a competition, add a round, create a match
   (pick schools in click order = turn order), select questions from the bank,
   **Publish** (blocked until the config is valid).
2. **Admin → Access Codes**: generate a code per school; each school's device
   joins at `/join`.
3. **Game Master**: open the match at `/gm`, **Start Match**, reveal questions,
   judge subjective answers, control the leaderboard, override scores with a
   reason when needed.
4. **Main screen**: open `/screen/<matchId>` on the projector (goes fullscreen).
