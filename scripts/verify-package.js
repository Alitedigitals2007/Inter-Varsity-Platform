#!/usr/bin/env node
// Structural verification of the offline package.
//
// Confirms the folder really is self-contained before it gets copied to a
// laptop or zipped into the installer — catching incomplete copies, a missing
// Prisma client, leaked credentials, and paths that exceed Windows' MAX_PATH
// (which would silently break the installer's archive step).
//
// Run:  npm run verify-package

const fs = require("node:fs");
const path = require("node:path");
const { REPO, packageDir } = require("./paths");

const ROOT = REPO;
const PKG = packageDir();

const problems = [];
const warnings = [];
const ok = [];

function check(rel, why) {
  const p = path.join(PKG, ...rel.split("/"));
  if (fs.existsSync(p)) ok.push(rel);
  else problems.push(rel + "  — " + why);
}

/**
 * Iterative, cycle-safe tree walk.
 *
 * A naive recursive walk breaks inside a real node_modules:
 *   • a junction/symlink pointing back at an ancestor recurses forever,
 *   • deep nesting can blow the stack.
 * Both were observed here — the first version of this script ran for ten
 * minutes without producing a single result. Links are skipped outright: a
 * shipped package should contain none.
 */
function walk(root) {
  const files = [];
  const dirs = [];
  const seen = new Set();
  const stack = [{ dir: root, depth: 0 }];

  while (stack.length) {
    const { dir, depth } = stack.pop();
    if (depth > 48) continue;

    // realpath() is what catches a junction back to an already-visited folder.
    let real;
    try {
      real = fs.realpathSync.native(dir);
    } catch {
      real = dir;
    }
    if (seen.has(real)) continue;
    seen.add(real);

    dirs.push(dir);

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // unreadable directory — not fatal
    }

    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) stack.push({ dir: full, depth: depth + 1 });
      else files.push(full);
    }
  }

  return { files, dirs, visited: seen.size };
}

function human(n) {
  if (n >= 1024 ** 3) return (n / 1024 ** 3).toFixed(2) + " GB";
  if (n >= 1024 ** 2) return (n / 1024 ** 2).toFixed(1) + " MB";
  return (n / 1024).toFixed(1) + " KB";
}

function main() {
  console.log("\nVerifying offline package…\n  " + PKG + "\n");

  if (!fs.existsSync(PKG)) {
    console.error('✖ Package not found. Run:  npm run package\n');
    process.exit(1);
  }

  // ── launcher + entry points ────────────────────────────────────────────────
  check("Start Offline.bat", "double-click entry point is missing");
  check("scripts/offline.js", "plain-JS launcher entry is missing");
  check("scripts/offline.ts", "launcher source is missing");
  check("scripts/lan.ts", "LAN detection used by the launcher is missing");
  check("package.json", "required by next start");
  check("next.config.ts", "required by next start");
  check(".next/BUILD_ID", "the app has not been compiled — run: npm run build");

  // ── services ───────────────────────────────────────────────────────────────
  check("realtime/server.ts", "realtime service source is missing");
  check("src/lib", "source imported by the realtime service is missing");

  // ── database ───────────────────────────────────────────────────────────────
  check("prisma/schema.prisma", "schema is required for prisma db push");
  check("prisma/seed.ts", "seed is required for first-run setup");

  const genDts = path.join(PKG, "node_modules", ".prisma", "client", "index.d.ts");
  if (!fs.existsSync(genDts)) {
    problems.push("node_modules/.prisma/client — Prisma client not generated (run: npm run db:generate)");
  } else if (fs.statSync(genDts).size < 100_000) {
    problems.push(
      "node_modules/.prisma/client — looks like an ungenerated stub (" +
        human(fs.statSync(genDts).size) +
        "); run: npm run db:generate"
    );
  } else {
    ok.push("node_modules/.prisma/client (" + human(fs.statSync(genDts).size) + ")");
  }

  // ── child-process entries the launcher resolves at runtime ────────────────
  check("node_modules/next/dist/bin/next", "next CLI entry is missing");
  check("node_modules/tsx/dist/cli.mjs", "tsx CLI entry is missing (runs realtime/server.ts)");
  check("node_modules/prisma/build/index.js", "prisma CLI entry is missing");

  // ── bundled runtime ────────────────────────────────────────────────────────
  const nodeExe = path.join(PKG, "runtime", "node", "node.exe");
  if (fs.existsSync(nodeExe)) {
    ok.push("runtime/node/node.exe (" + human(fs.statSync(nodeExe).size) + ")");
  } else {
    warnings.push(
      "no bundled Node runtime — the target laptop must have Node installed. " +
        "Stage it at runtime/node and re-run: npm run package"
    );
  }

  // ── must NOT be shipped ────────────────────────────────────────────────────
  for (const forbidden of [".env", ".offline-initialized"]) {
    if (fs.existsSync(path.join(PKG, forbidden))) {
      problems.push(
        '"' +
          forbidden +
          '" was packaged — it can carry credentials. Remove it; the launcher generates it on first run.'
      );
    }
  }
  if (!problems.some((p) => p.startsWith('".env"'))) ok.push(".env correctly excluded");

  // ── walk: size, file count, MAX_PATH ───────────────────────────────────────
  const MAX_PATH = 260;
  const tree = walk(PKG);

  let longest = "";
  for (const f of tree.files) if (f.length > longest.length) longest = f;

  for (const d of tree.dirs) {
    if (d.length > longest.length) longest = d;
    // Prisma's dot-prefixed staging dirs must not have been copied.
    if (
      path.basename(d).startsWith(".") &&
      /[\\/]node_modules[\\/]@prisma$/.test(path.dirname(d))
    ) {
      problems.push("Prisma staging dir was copied: " + d.replace(PKG, ""));
    }
  }

  const files = tree.files.length;

  // Total size is cosmetic, so it gets a time budget: with aggressive
  // real-time antivirus a 33k-file stat pass can take minutes, and a number
  // in a report is not worth hanging the whole check for.
  let bytes = 0;
  let sized = 0;
  const deadline = Date.now() + 20_000;
  for (const f of tree.files) {
    if (Date.now() > deadline) break;
    try {
      bytes += fs.statSync(f).size;
      sized++;
    } catch {
      /* ignore */
    }
  }

  if (longest.length >= MAX_PATH) {
    problems.push(
      "path reaches " +
        longest.length +
        " chars (>= " +
        MAX_PATH +
        "): " +
        longest.replace(PKG, "")
    );
  } else {
    ok.push("longest path " + longest.length + "/" + MAX_PATH + " chars");
  }

  // ── report ─────────────────────────────────────────────────────────────────
  console.log(
    "  files: " + files + "   size: " + human(bytes) + (sized < files ? "  (partial)" : "")
  );
  console.log("");

  if (warnings.length) {
    console.log("  ⚠ warnings");
    for (const w of warnings) console.log("    - " + w);
    console.log("");
  }

  if (problems.length) {
    console.log("  ✖ problems (" + problems.length + ")");
    for (const p of problems) console.log("    - " + p);
    console.log("\n✖ Package is NOT ready to ship.\n");
    process.exit(1);
  }

  console.log("  ✔ all " + ok.length + " structural checks passed");
  console.log("\n✔ Package is self-contained and ready.\n");
}

main();
