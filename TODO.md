# TODO — Inter-Varsity Platform

## 0d. Guided competition setup — one wizard (2026-10-17) ✅ DONE
- [x] **Structure planner** (`src/lib/formats.ts`) — `planStructure(format,
      schoolIds)`: League (N rounds, all schools), Knockout (round 1 pairings,
      three-way on odd counts), Qualify & finals (preliminaries), Points race;
      plus `buildRulesText` that writes the rules sheet from the game settings
- [x] **One-flow wizard** — `/admin/competitions/new`: Basics → Format →
      Schools → Rules & game → Questions → Review. The format + school count
      determine the rounds/matches (live structure preview); qualify/eliminate
      defaults follow the format; rules sheet auto-generated (editable);
      question set assigned to every match; one click creates + publishes
- [x] **Setup API** — `POST /api/admin/competitions/setup` creates the whole
      skeleton (competition → rounds → matches → questions → publish) in one
      call; returns the plan, publish results and per-match blockers
- [x] **Advance from qualified** — `POST /api/admin/competitions/[id]/advance`:
      once every match of a round is COMPLETED, builds the next round from
      QUALIFIED schools (Knockout pairs winners; Qualify & finals → Final),
      copies the question set, auto-publishes, un-completes the competition
      when a new round is added; button on the competition page
- [x] **Competition page guidance** — Setup progress checklist (format →
      rounds → questions → published → live), "Create next round from
      qualified schools →" action, "Assign to N empty match(es)" bulk assign
- [x] **Shared publish checklist** (`src/lib/publishMatch.ts`) — one source of
      truth for publish validation, reused by the publish route, setup and
      advance flows
- [x] Competitions list page now funnels into the wizard (inline form removed)
- [x] Verified live: KO 4-school setup+play → auto-qualified winners → Final
      created/published; TOP_N_FINAL 3-school prelim → top 2 → Final; tie
      boundary → PENDING blocks advance (correct); build green, tsc clean

## 0c. Qualify · Reports · Auto-advance · Timer ring · Sponsor Studio (2026-10-17) ✅ DONE
- [x] **Qualification & elimination** — wizard + Admin → Settings set qualify
      (top N) / eliminate (bottom N); applied automatically at match end
      (`applyQualification`), boundary ties flagged PENDING for review;
      GM dashboard has a manual override panel (`QUALIFICATION_SET`, audited)
- [x] **Round auto-complete** — `turns.perSchool` ends each match after every
      school played its configured turns (`totalTurnLimit`); round completes
      when all its matches close (`maybeCompleteRound`, `ROUND_COMPLETED`);
      competition completes when every round is done
- [x] **Reports & exports** — `/admin/reports` + `/api/admin/reports`:
      event summary, standings, match results, question-by-question,
      corrections/overrides, timer overrides; **CSV download** (UTF-8 BOM,
      escaped) and **print/PDF** view (print styles hide chrome)
- [x] **Auto-advance** — after a result is revealed the server schedules
      `Match.autoAdvanceAt` (+config seconds, default 5 s); a countdown pill
      with progress bar shows on screen/play/GM; `handleAutoAdvance` hands
      the turn over lazily like timers; GM can advance early or pause
- [x] **Timer ring** — `TimerRing` circular depleting clock (digits + ring,
      urgency colours, pulse under 5 s) on screen/play/GM; Web Audio sound
      engine (`src/lib/sound.ts`, no assets): ticks, time-up buzz, verdict
      chimes, turn/match-start cues + per-device mute (localStorage)
- [x] **Sponsor Studio** — `/admin/show` merged sponsor + show director:
      sponsor profiles (description, website, tier, brand-colour pickers),
      quick-add slides (spotlight, partner slide, logo rotation, final
      acknowledgment), Pre-game/Break/In-game preview switcher
- [x] **Public sponsor preview** — `/show/[id]` (no auth) renders the venue
      show in every phase so sponsors can approve their branding
- [x] **ShowStage** — new segments `SPONSOR_SPOTLIGHT`, `PARTNER_SLIDE`,
      `FINAL_ACK` with brand-colour backdrops/accents; Prisma enum extended
- [x] **Admin settings** — `/admin/settings` + `Setting` Key/Value model
      (`src/lib/settings.ts`): defaults for turns, qualify/eliminate,
      auto-advance delay, sound; pre-filled into the Match Wizard
- [x] **Leaderboard qualification badges** (QUALIFIED / ELIMINATED / tie pending)
- [x] `npx tsc --noEmit` clean · `next build` green (42 routes) ·
      `prisma db push` applied · `sql/schema.sql` regenerated

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
