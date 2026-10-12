# TODO — Inter-Varsity Platform

## 1. Offline installer on another laptop
- [x] Offline launcher resolves binaries WITHOUT network (no npx/npm fetch)
- [x] Launcher runs real JS entries (tsx/cli.mjs, next/dist/bin/next) with resolved Node
- [x] Prisma schema path resolved at runtime for packaged layout
- [x] "Start Offline.bat" double-click entry (server mode, prints LAN join address)
- [x] **Fixed critical bug**: `scripts/offline.js` used `ROOT = __dirname`, so every path
      resolved to `<pkg>/scripts/...` and the launcher aborted immediately on any machine
- [x] Portable Node v24.21.0 staged at `runtime/node/` (target laptop needs no Node install)
- [x] `scripts/package.js` — robocopy-based, skips Prisma staging dirs, writes outside OneDrive
- [x] `scripts/paths.js` — shared output location (auto-escapes OneDrive, `IVP_OUT` override)
- [x] `installer/Setup.cs` — self-extracting stub, compiled by Windows' built-in `csc.exe`
- [x] `scripts/make-installer.js` — stub + marker + payload.zip → one `.exe`
- [x] `scripts/verify-package.js` — structural checks incl. MAX_PATH and leaked `.env`
- [x] `scripts/smoke-test.js` — boots the package and asserts pages return 200
- [ ] `npm run package` completes for the real tree
- [ ] `npm run verify-package` green
- [ ] `npm run smoke-test` green
- [ ] `npm run installer` produces `Inter-Varsity-Platform-Setup.exe`

## 2. Audit against spec
- [x] Read Inter_Varsity_Competition_Platform_Full_Specification.md fully
- [x] Map functionalities to existing code (src/app + src/lib + realtime)
- [x] Coverage: all 4 interfaces + admin sub-pages + engine + realtime + API routes present
- [ ] Produce a written coverage table for the user (✅ / ⚠ / ❌)

## 3. Per-role guide + role-based views
- [x] src/components/RoleGuide.tsx (ADMIN, GAME_MASTER, SCHOOL, PUBLIC)
- [x] Guide shown on /admin (overview)
- [x] Guide shown on /gm (game master index)
- [x] Guide shown on /join (school/contestant entry)
- [x] Guide shown on /screen (public/audience picker)
- [x] Login page: who-signs-in-here guidance + links to /join and /screen
- [x] Role-based views verified: /play (school), /gm (staff), /screen (public), /admin (admin)

## 4. Admin credentials & delegated passwords
- [x] Admin password pinned to `fassaui` (seed, idempotent re-seed)
- [x] Admin creates Game Master / Admin accounts WITH a set password (Users API+UI)
- [x] Admin can RESET any staff user's password (Users UI button + inline form)
- [x] Schools use access codes (generate / regenerate / revoke / expire) — admin-controlled
- [x] No passwords written to logs/audit (audit stores role/loginId only)

## Build health
- [x] Corrupted `node_modules` repaired (zod, @next/swc-win32, @types/node) via direct tarballs
- [x] Prisma schema missing reverse relations fixed → real 2 MB client generated
- [x] `npx tsc --noEmit` clean (0 errors)
- [x] `npm run build` (`next build --webpack`) green — 33/33 pages, valid `.next/BUILD_ID`
- [x] Disabled `cacheComponents` — every route is request-time (cookies + Postgres),
      so static shells were both useless and failing the build

## Remaining / deferred
- [ ] git init + commit + push to GitHub (user asked to defer this for now)
- [ ] Vercel (Next) + Render (realtime) + Neon (Postgres) deploy walkthrough (deferred)
- [ ] Note for deploy: `tsx` and `prisma` are currently devDependencies — move to
      `dependencies` before a production `npm ci --omit=dev`, or the realtime service
      and `db push` will not be available
- [ ] Final online/offline usage explanation for the user
