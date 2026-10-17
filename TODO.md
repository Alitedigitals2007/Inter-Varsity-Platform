# TODO — Inter-Varsity Platform

## 0b. Brand, theme & rules pass (2026-10-16) ✅ DONE
- [x] **FAASSA crest** (`Fassa.png`) is now the site logo: favicon
      (`src/app/icon.png`), login, join, admin sidebar, and the landing page
- [x] **Theme** rebuilt around the crest — royal navy (not black), brighter
      gold, blue glows, gradient panels/buttons, styled scrollbars & selection
- [x] **Board** — one category at a time (tabs with remaining counts),
      questions numbered 1..N per category; shared by /play, /gm and /screen
- [x] **Pre-game instructions** — competition rules + format slide plays in
      the venue show (INSTRUCTIONS segment), and /play + /gm show a rules
      card during LOBBY
- [x] **Rules & format editor** — admin picks a well-explained format preset
      (League / Knockout / Qualify & finals / Points race) and writes rules;
      saved on the competition, visible to schools, GM, and screens
- [x] **Auto-assign questions** — ✨ button in the wizard balances picks
      across categories (round-robin, shuffled)
- [x] Screen question display polished (fluid type, lettered option chips)

## 0. Gameplay & admin UX upgrade (2026-10-16) ✅ DONE
- [x] **Leaderboard** — full-screen animated takeover on the venue screen
      (staggered row entrance, count-up scores, medals); compact panel stays
      on school devices
- [x] **School answers** — MC options with letter labels + chosen-option
      flash; verdict lands instantly (objective answers auto-reveal to
      RESULT) with pop/burst/shake animations on /play and /screen
- [x] **Auto-open** — selecting a question now activates + reveals it and
      starts the answer timer immediately (no separate GM reveal step);
      QUESTION_REVEAL kept for compatibility
- [x] **Break** — GM "Break ☕" button (`BREAK_SET` command, pauses timer);
      venue screen plays the full break show; school devices see a banner
- [x] **Import** — template + docs now show options with `isCorrect` marking
      (API already supported options)
- [x] **Points** — MatchWizard step sets points per question for the whole
      match; config supports answer seconds + turns
- [x] **Match setup wizard** — 4-step guided flow (Basics → Schools →
      Questions & points → Review) with Create draft / Create & publish
- [x] **Bulk question delete** — select-all + per-row checkboxes,
      `DELETE /api/admin/questions/bulk` (skips questions used in matches)
- [x] General polish: question card entrance, board cell pop, option flash,
      leaderboard/break/verdict motion in globals.css (reduced-motion safe)

## 1. Code health (verified 2026-10-16)
- [x] `npx tsc --noEmit` clean (0 errors)
- [x] `next build` green — 35 routes incl. new `/admin/show`, `/api/media`,
      `/api/realtime/token`, `/api/matches/[id]/show`
- [x] `.env` untracked; secrets cannot leak to GitHub
- [x] `sql/schema.sql` regenerated to match the new Prisma schema;
      `sql/seed.sql` unchanged and current
- [x] School-facing pages checked for mobile fitness; stage uses fluid `clamp()` type

## 2. Realtime redesign — Socket.IO → Ably ✅ DONE
Implemented with **zero new npm dependencies** (Ably REST over native `fetch`;
browser SDK loaded from Ably's CDN only when configured):
- [x] Deleted `realtime/server.ts`, `render.yaml`, `dev:rt` script
- [x] Removed `socket.io` / `socket.io-client` from package.json
- [x] `src/lib/ably.ts` — REST helper (publish + token mint)
- [x] `src/lib/bus.ts` — publishes committed events to Ably `match-{id}`
- [x] `src/app/api/realtime/token/route.ts` — session → scoped Ably token
      (STAFF: all matches · SCHOOL: own matches · PUBLIC: requested match)
- [x] `useMatchRealtime` — Ably push with automatic 2.5 s polling fallback
      (same hook API; offline/LAN/no-key mode works unchanged)
- [x] `src/lib/timers.ts` — lazy timer enforcement in snapshot/command reads
      (server-authoritative, no background process, no cron)
- [x] Env: removed `REALTIME_PORT`, `NEXT_PUBLIC_REALTIME_URL`,
      `REALTIME_INTERNAL_SECRET`; added `ABLY_API_KEY` (server-only, optional)

## 3. Live Show Stage ✅ DONE (DB-stored media, admin-composed)
- [x] Prisma: `Media` (bytea), `ShowSegment`, logo refs on School/Competition/Sponsor
- [x] `POST /api/media` (device upload, client-side downscale ≤ ~560 KB WebP)
      + `GET /api/media/[id]` (public, immutable cache)
- [x] `GET/PUT /api/admin/matches/[id]/show` — segment timeline (type,
      placement PRE_GAME/BREAK/IN_GAME, duration, slot, sponsor, enable)
- [x] `GET /api/matches/[id]/show` — public stage config with built-in defaults
- [x] Sponsors API (create/patch/delete + logo)
- [x] `/admin/show` Show Director: match picker, ordered segment editor,
      sponsor manager, competition + school logo uploads, live preview
- [x] `ShowStage` renderer: animated backdrop, event branding, school team
      cards, sponsor rotation, countdown, ticker, border FX — pure CSS motion,
      reduced-motion respected, fluid typography for phone → projector
- [x] `/screen/[id]`: show plays pre-match/ended; overlays during play;
      linked from the admin overview

## 4. Online deployment — Vercel + Neon + Ably
- [x] `vercel.json` updated (single build command, no realtime references)
- [x] `prisma` + `tsx` moved to `dependencies` (serverless + offline safe)
- [x] README + SETUP.md rewritten for the new architecture; deploy guide (Option C)
- [x] Design spec: `docs/superpowers/specs/2026-10-16-online-deployment-design.md`
- [x] `npm install` — lockfile refreshed (socket.io removed, dep moves applied)
- [x] `npx prisma db push` against Neon — Media/ShowSegment tables live
- [x] `git push origin main` — pushed (er4l1m4d accepted the collaborator invite;
      gh credential helper set up for future pushes)
- [ ] Ably app created; `ABLY_API_KEY` set in Vercel (optional — polling works without)
- [ ] Vercel project import + env vars: `DATABASE_URL`, `SESSION_SECRET`,
      `ABLY_API_KEY`, `ADMIN_PASSWORD`
- [ ] Production seed with strong `ADMIN_PASSWORD` (never `fassaui` online)
- [ ] Live smoke test on the deployed URL: login, create/publish match, run it,
      screens sync; compose a show in `/admin/show`

## 5. Offline installer (toolchain updated; real runs pending)
- [x] `scripts/offline.ts` — single-process launch (no realtime service),
      env setup trimmed, prereq checks updated
- [x] `scripts/package.js` / `verify-package.js` / `smoke-test.js` — realtime
      artifacts and port-4000 checks removed
- [ ] `npm run package` completes for the real tree
- [ ] `npm run verify-package` green
- [ ] `npm run smoke-test` green
- [ ] `npm run installer` produces `Inter-Varsity-Platform-Setup.exe`

## 6. Audit against spec (deferred)
- [x] Read full specification; map functionalities to code
- [ ] Produce written coverage table (✅ / ⚠ / ❌) for the user
