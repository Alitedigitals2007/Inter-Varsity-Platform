# Design — Online Deployment (Vercel + Neon + Ably) & Live Show Stage

**Date:** 2026-10-16
**Status:** Approved in brainstorming (user approved Sections 1–3 and Approach A; user directed immediate implementation: "do the right thing… make it work online… do all without asking questions").

## Goal

Take the Inter-Varsity Competition Platform from local/offline-only to a
publicly deployable web app, and add a "live show" broadcast experience to the
venue screen — responsive on every device (phones, laptops, projectors).

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Hosting | **Vercel** (Next.js) + **Neon** (Postgres) — no second Node host |
| Realtime | **Ably** push (user's choice), automatic **snapshot polling** fallback |
| Scope | Online deployment end-to-end, push to GitHub, strong production admin |
| Production DB | Existing Neon project (`DATABASE_URL` already provisioned) |
| Admin | Strong `ADMIN_PASSWORD` at seed time; `fassaui` stays local-only |
| Live-show media | Uploaded **from device**, stored **in the database** (bytea) |
| Live-show timing | Full show pre-match + breaks; in-game = optional zoom-in border FX |
| SQL | `sql/schema.sql` + `sql/seed.sql` already exist — kept current with `prisma db push` |

## Architecture

One deployable unit (Next.js on Vercel) + one database (Neon) + one optional
SaaS dependency (Ably). The previous Socket.IO service (`realtime/server.ts`,
`render.yaml`) is deleted.

### Realtime

- **Publish (server):** after a command commits, `src/lib/bus.ts` publishes
  `{ type, payload }` to Ably channel `match-{id}` via the **REST API using
  native fetch** (`src/lib/ably.ts`) — zero new npm dependencies.
- **Subscribe (browser):** `useMatchRealtime` fetches a scoped token from
  `GET /api/realtime/token`, loads the Ably SDK **from Ably's CDN** (only when
  the server reports it is configured), and subscribes.
- **Fallback:** when `ABLY_API_KEY` is unset (offline installer, LAN mode) or
  the token/CDN/connection fails, the hook polls
  `/api/matches/[id]/snapshot` every 2.5 s. Same hook API — no UI changes.
- **Token scoping:** STAFF → `match-*`; SCHOOL → only matches their school is
  in; PUBLIC → only the explicitly requested match (venue screens).
- **Timer authority:** `enforceTimerExpiry()` (`src/lib/timers.ts`) runs
  `handleTimerExpiry` inside the engine transaction whenever a snapshot or
  command read observes a passed deadline, then publishes the resulting
  events. No background scheduler, no cron — still server-authoritative.

### Live Show Stage

- **Schema additions:** `Media` (bytea + mime + dims), `ShowSegment`
  (ordered per match: `type`, `placement` PRE_GAME/BREAK/IN_GAME,
  `durationSec`, `slot`, optional media/sponsor/style) plus logo references
  on `School`, `Competition`, `Sponsor`.
- **APIs:** `POST /api/media` (staff upload, base64, ≤ ~560 KB),
  `GET /api/media/[id]` (public, immutable cache),
  `GET/PUT /api/admin/matches/[id]/show` (Show Director),
  `GET /api/matches/[id]/show` (public stage config with defaults),
  `GET/POST /api/admin/sponsors`, `PATCH/DELETE /api/admin/sponsors/[id]`.
- **Composer:** `/admin/show` — match picker, ordered segment editor
  (type/placement/duration/slot/sponsor/enable, reorder, delete), sponsor
  manager with device logo upload, competition + school logo uploads, and a
  true-to-projector **live preview** (viewport-scaled).
- **Renderer:** `src/components/stage/ShowStage.tsx` — animated backdrop,
  event branding, school team cards, sponsor rotation (bug/lower-third),
  countdown, ticker, border FX. Pure CSS keyframes (GPU-composited);
  rotation engine cycles segments by their configured duration. Reduced-motion
  respected.
- **Defaults:** with no configured segments the screen still plays the
  built-in show (branding → team cards → sponsors → countdown + ticker).
- **Device fit:** `clamp()` typography, fluid layout — phone → laptop →
  projector; the screen page remains read-only and fullscreen.

### Offline impact

The offline installer now runs **one** process (Next.js). `scripts/offline.ts`
no longer launches the realtime service; `package.js`, `verify-package.js`,
and `smoke-test.js` drop realtime artifacts and port-4000 checks. LAN devices
poll the same Next server — fewer firewall surfaces.

## Testing / verification

- `npx tsc --noEmit` (0 errors) and `next build` (all routes) after changes.
- Manual: `/admin/show` preview; `/screen/[id]` plays show in LOBBY/ENDED,
  overlays during play; admin/GM flows (login, schools, questions, import,
  judging, overrides) unchanged except bus transport.
- Offline package scripts updated to pass structurally with the new layout.

## Deployment order

1. Ably app (optional) → copy `ABLY_API_KEY`.
2. Push repo to GitHub → import to Vercel → set
   `DATABASE_URL`, `SESSION_SECRET`, `ABLY_API_KEY`, `ADMIN_PASSWORD`.
3. `DATABASE_URL=<neon> npx prisma db push` + seed with strong admin password
   (or run `sql/` files in the Neon SQL editor).
4. Smoke test the live site: login, create/publish a match, run it with
   `/gm` + `/screen` + `/join`, watch sync (instant with Ably, ≤ 2.5 s polling).

## Non-goals / deferred

- Spec-coverage audit table (TODO §6), offline installer real-run checklist
  (TODO §5), Vercel cron anything (not needed — lazy timers).
