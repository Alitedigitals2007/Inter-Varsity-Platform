# Setup & Deployment Guide

Inter-Varsity Competition Platform — Faculty of Science, University of Ibadan.

This app has **two runtime pieces**:

1. **Next.js app** — serves the four screens (Admin, Game Master, Main Screen, School) and the API. Hostable on **Vercel**.
2. **Realtime service** (`realtime/server.ts`) — a long-running Socket.IO + timer process. It enforces the authoritative countdown and pushes live updates. It **cannot** run on Vercel (serverless functions don't stay alive), so it needs a persistent host: **Render / Railway / Fly / a VPS**, or your own machine in offline mode.

The Next.js app talks to the realtime service over HTTP:
- **Outbound (server → realtime):** `src/lib/bus.ts` POSTs to `${REALTIME_URL}/internal/emit` with the `x-internal-secret` header.
- **Inbound (browser → realtime):** the client hook connects a socket to `NEXT_PUBLIC_REALTIME_URL`.

The **database (Postgres) is the source of truth.** Every screen reconciles from a DB snapshot, so a missed broadcast never leaves a screen stale.

---

## Environment variables

Create `.env` from `.env.example`. Never commit `.env` (it is git-ignored).

| Var | Used by | Notes |
|-----|---------|-------|
| `DATABASE_URL` | both | Postgres connection string (e.g. Neon). Required. |
| `SESSION_SECRET` | both | Long random string. Required. |
| `SESSION_TTL_HOURS` | both | Session lifetime. Default 24. |
| `REALTIME_PORT` | realtime only | Port the realtime service listens on. |
| `NEXT_PUBLIC_REALTIME_URL` | Next.js (build-time) | Public URL browsers use to reach the realtime service. **Baked in at build time** (it's `NEXT_PUBLIC_`). |
| `REALTIME_INTERNAL_SECRET` | both | Shared secret. Must match on both sides. |
| `ADMIN_PASSWORD` | seeding | Initial admin password (default `fassaui`). Applies whenever the seed runs. |

In **offline/local** mode: `NEXT_PUBLIC_REALTIME_URL="http://localhost:4000"`.
In **online** mode: set it to your realtime host's public URL (e.g. `https://fassa-realtime.onrender.com`).

---

## Option A — Offline installer (recommended: no Node, no VS Code)

This is the "hand someone one file" path. A single `.exe` installs the whole
platform onto a Windows laptop with **no Node.js, no VS Code, no npm and no
internet** required at install time or run time.

### Build it once (on a machine with this project + Node)

Run these in order:

```
npm run build            # compile the Next.js app
npm run package          # assemble the self-contained folder
npm run verify-package   # structural checks: bundled runtime, no leaked .env, no MAX_PATH
npm run smoke-test       # actually boot it and confirm the pages return 200
npm run installer        # produce the single-file installer
```

`npm run installer` prints where the file lands — normally
`%USERPROFILE%\Downloads\Inter-Varsity-Platform-Setup.exe`. Copy that **one**
file to any Windows machine.

> **Why `Downloads`?** If this project lives inside OneDrive, build outputs are
> written there instead of the repo's `dist/`. Writing ~1 GB of artifacts into a
> OneDrive folder makes Windows re-upload every file while it is being copied —
> measured at ~19 files/sec, a copy that never finishes. Override the location
> with `IVP_OUT=<absolute path>`.

### Install on the target laptop

1. Copy the single `.exe` over (USB stick, shared folder, or download).
2. Double-click it. It extracts, creates a **Desktop** and **Start Menu**
   shortcut, and offers to launch immediately.
3. **First run** asks two questions:
   - `DATABASE_URL` — your Postgres connection string
   - `SESSION_SECRET` — any long random text
   It then applies the schema, seeds the demo competition, schools, questions
   and logins, and starts both services. This takes a minute or two the first time.
4. The console window prints the addresses to open. Keep it open — it is the server.

Default install location is `%LOCALAPPDATA%\InterVarsityPlatform`, which needs
no admin rights. Pass a different folder when prompted, or run
`Setup.exe --dest "D:\InterVarsity"` for an unattended path.

### Joining from other devices

The launcher prints this machine's LAN address (e.g. `http://192.168.1.7:3000`).
Any laptop or phone on the **same Wi‑Fi / LAN** opens that address and gets
`/join`, `/screen` and `/gm` fully live — they need nothing installed.

### Accounts

- **Admin** — `admin` / `fassaui`
- **Game Master** — `gm` / `gm123456`
- **Schools** — join with an access code created in `/admin`

Change these after first login; Admin can create and reset Game Master and
staff passwords.

### Uninstall

Double-click `Uninstall.bat` in the install folder (or just delete the folder).
It removes the shortcuts and the application files.

---

## Option B — Run from source (VS Code, one machine)

Everything runs on your laptop. You need a Postgres database locally (or in Docker).

### 1. Install prerequisites
- **Node.js 18+** and npm
- **VS Code** (with the "ES7+ React snippets" and "Prisma" extensions, optional)
- **Postgres** — either:
  - native Postgres installed and running on `localhost:5432`, or
  - Docker: `docker run --name fassa-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16`

### 2. Open the project in VS Code
```
File → Open Folder → select the project folder
```
Open a terminal in VS Code: `` Ctrl+` `` (backtick).

### 3. Configure the database
Create `.env` in the project root. For local Docker Postgres:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/fassa?schema=public"
SESSION_SECRET="dev-secret-change-me"
SESSION_TTL_HOURS="24"
REALTIME_PORT="4000"
NEXT_PUBLIC_REALTIME_URL="http://localhost:4000"
REALTIME_INTERNAL_SECRET="dev-internal-secret-change-me"
```
Then create the database on first run: `createdb fassa` (or let Docker's default `postgres` DB be used by pointing the URL at `/postgres`).

### 4. Install, generate, migrate, seed
Run these **one at a time** and let each finish before the next (long commands; if your terminal is slow, run them individually):
```
npm install
npx prisma generate
npx prisma db push
npm run db:seed
```
- `prisma generate` creates the typed client (needed for the type-check/build).
- `db push` syncs the schema to Postgres.
- `db:seed` loads demo competition, schools, questions, and a Game Master login.

### 5. Start both services
In **two separate terminals** (both in VS Code):

Terminal 1 — Next.js:
```
npm run dev:next
```
Terminal 2 — realtime service:
```
npm run dev:rt
```
Or run both together in one terminal:
```
npm run dev
```

### 6. Use it
- Next.js: **http://localhost:3000**
- Realtime health check: **http://localhost:4000/health**

Open http://localhost:3000 and pick a screen. The four screens are:
- `/admin` — set up competitions, schools, access codes, question bank
- `/gm` — Game Master runs the live match
- `/screen` — projector / audience view
- `/join` — school devices join with an access code and play

All four sync live because they share the same local DB + realtime service.

---

## Option C — Deploy online (Vercel + Render)

Split deployment: **Next.js on Vercel**, **realtime service on Render** (or Railway/Fly/VPS), **Postgres on Neon**.

### 1. Database — Neon
1. Create a Neon project → copy the connection string.
2. This is your `DATABASE_URL`.

### 2. Realtime service — Render
1. Push this repo to GitHub.
2. Render → **New → Blueprint** → pick the repo (it reads `render.yaml`).
3. Set the env vars Render asks for: `DATABASE_URL`, `SESSION_SECRET`, `REALTIME_INTERNAL_SECRET` (leave `REALTIME_PORT` as the blueprint value — Render assigns the port).
4. Deploy. Note the public URL, e.g. `https://fassa-realtime.onrender.com`.
   Health check path is `/health` (already configured).

### 3. Next.js app — Vercel
1. Vercel → **New Project** → import the same repo (it reads `vercel.json`).
2. Set environment variables for **Production, Preview, and Development**:
   - `DATABASE_URL` = your Neon string
   - `SESSION_SECRET` = same value as Render
   - `REALTIME_INTERNAL_SECRET` = same value as Render
   - `NEXT_PUBLIC_REALTIME_URL` = your Render public URL (e.g. `https://fassa-realtime.onrender.com`)
3. Deploy. Vercel runs `prisma generate && next build` (per `vercel.json`).

### 4. Initialize the production database
Run against the Neon URL once:
```
DATABASE_URL="<neon-url>" npx prisma db push
DATABASE_URL="<neon-url>" npm run db:seed
```

### 5. Verify
- Open the Vercel URL → the four screens work.
- `https://<your-realtime>/health` returns `{"ok":true,...}`.
- Start a match in `/gm` and confirm `/screen` and `/join` update live.

### Why Vercel can't host the realtime part
Vercel functions are serverless — they freeze between requests and have hard time limits. The realtime service is a **persistent** Socket.IO server with in-memory timer scheduling and a background sweep loop; it needs a process that stays up. That's why it lives on Render (or similar). If you want a single host instead, deploy both to a VPS and run `npm run dev` (or `next start` + `npx tsx realtime/server.ts` under a process manager like pm2).

---

## Command reference

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npx prisma generate` | Generate the typed Prisma client |
| `npx prisma db push` | Sync schema to the database |
| `npm run db:seed` | Seed demo data |
| `npm run dev` | Start Next.js + realtime together |
| `npm run dev:next` | Next.js only |
| `npm run dev:rt` | Realtime service only |
| `npm run build` | Production Next.js build |
| `npm run package` | Build the self-contained offline folder |
| `npm run verify-package` | Structural checks on the offline folder |
| `npm run smoke-test` | Boot the offline folder and assert the pages answer |
| `npm run installer` | Produce the single-file Windows installer |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Type-check |

> **⚠ Important — OneDrive slows this project down dramatically.**
>
> If this project lives inside OneDrive (Desktop and Documents are redirected
> there by default), its files often exist only as cloud *placeholders* thanks
> to OneDrive's "Files On-Demand". Every read then becomes a network download.
> That is why `npm install`, `next build` and `npm run package` can appear to
> hang — a 35,000-file copy measured **~19 files/sec** here, and never finished
> in 30 minutes.
>
> **Fix:** right-click the project folder → **Always keep on this device**. This
> downloads everything once and makes all later builds take minutes instead of
> an hour. Deleting and re-creating files also re-triggers placeholders, so if a
> build suddenly becomes slow again, re-pin the folder.
>
> Build outputs already avoid this: `npm run package` detects an OneDrive project
> and writes to `%USERPROFILE%\Downloads` instead of `dist/`, so ~1 GB of
> artifacts is never uploaded (see `scripts/paths.js`).
>
> If a command does hang, let it finish rather than killing it — a partial
> `prisma generate` leaves stub type files and causes type errors. If that
> happens, just re-run `npx prisma generate`.
